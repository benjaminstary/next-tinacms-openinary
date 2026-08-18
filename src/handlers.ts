import type { NextApiRequest, NextApiResponse } from "next";
import { readFile, unlink } from "node:fs/promises";
import formidable, {
  type Fields,
  type Files,
  type File as FormidableFile,
} from "formidable";
import { OpeninaryClient } from "./openinary-client.js";
import { assertMediaPath } from "./media-path.js";
import { mapListing, mapUpload } from "./media-mapper.js";
import { isSafeUploadFile } from "./upload-validation.js";
import type { OpeninaryServerOptions } from "./types.js";
export const mediaHandlerConfig = { api: { bodyParser: false } };
const MAX_LIST_LIMIT = 1000;
const DEFAULT_ACCEPTED_MIME_TYPES = ["image/*"];
function parseInteger(
  value: string | string[] | undefined,
  fallback: number,
  name: string,
  maximum: number,
  minimum = 1,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Malformed ${name}`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`Invalid ${name}`);
  return parsed;
}
function isAcceptedMimeType(mimeType: string, accepted: string[]): boolean {
  return accepted.some((pattern) =>
    pattern.endsWith("/*")
      ? mimeType.startsWith(pattern.slice(0, -1))
      : mimeType === pattern,
  );
}
async function parseMultipart(
  req: NextApiRequest,
  options: OpeninaryServerOptions,
): Promise<{ directory: string; files: FormidableFile[] }> {
  const form = formidable({
    multiples: true,
    allowEmptyFiles: false,
    maxFileSize: options.maxUploadFileSize ?? 100 * 1024 * 1024,
    maxTotalFileSize: options.maxUploadTotalSize ?? 200 * 1024 * 1024,
    maxFields: options.maxUploadFields ?? 10,
    maxFiles: options.maxUploadFiles ?? 50,
  });
  const [fields, files] = await new Promise<[Fields, Files]>(
    (resolve, reject) => {
      form.parse(req, (error, parsedFields, parsedFiles) => {
        if (!error) {
          resolve([parsedFields, parsedFiles]);
          return;
        }
        cleanupFiles(filesFromParsed(parsedFiles)).finally(() => reject(error));
      });
    },
  );
  const uploaded = filesFromParsed(files);
  const value = fields.directory;
  return {
    directory: Array.isArray(value)
      ? String(value[0] ?? "")
      : String(value ?? ""),
    files: uploaded,
  };
}
function filesFromParsed(files: Files): FormidableFile[] {
  const values = files.files ?? [];
  return (Array.isArray(values) ? values : [values]).filter(
    Boolean,
  ) as FormidableFile[];
}
async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Media authorization timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
async function cleanupFiles(files: FormidableFile[]): Promise<void> {
  await Promise.allSettled(files.map((file) => unlink(file.filepath)));
}
function isClientInputError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^(Absolute media paths|Invalid media path|Media path outside|Malformed |Invalid |Missing |Unsupported )/.test(
      error.message,
    )
  );
}
export function createMediaHandler(options: OpeninaryServerOptions) {
  const client = new OpeninaryClient(options);
  return async function mediaHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ): Promise<void> {
    const authorization = options.authorized ?? options.authorize;
    let parsedFiles: FormidableFile[] = [];
    if (!authorization) {
      res.status(500).json({ error: "Media authorization is not configured" });
      return;
    }
    try {
      if (req.method === "POST" || req.method === "DELETE") {
        const headers = req.headers ?? {};
        const origin = headers.origin;
        const allowedOrigins = options.allowedOrigins ?? [
          `${headers["x-forwarded-proto"] ?? "http"}://${headers.host}`,
        ];
        if (origin && !allowedOrigins.includes(origin)) {
          res.status(403).json({ error: "Cross-origin request denied" });
          return;
        }
      }
      if (req.method === "POST") {
        const maxRequestSize =
          options.maxUploadRequestSize ??
          options.maxUploadTotalSize ??
          200 * 1024 * 1024;
        const contentLength = req.headers?.["content-length"];
        const rawContentLength = Array.isArray(contentLength)
          ? contentLength[0]
          : contentLength;
        if (
          rawContentLength !== undefined &&
          (!/^\d+$/.test(rawContentLength) ||
            Number(rawContentLength) > maxRequestSize)
        ) {
          res.status(413).json({ error: "Upload request too large" });
          return;
        }
      }
      const authorized = await withTimeout(
        (signal) => Promise.resolve(authorization(req, res, signal)),
        options.authorizationTimeoutMs ?? 10_000,
      );
      if (authorized === false) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.method === "GET") {
        const requestedDirectory = String(req.query.directory ?? "");
        const directory = assertMediaPath(
          requestedDirectory || options.mediaRoot || "",
          options.mediaRoot,
        );
        const all = mapListing(
          await client.list(directory),
          options.publicDeliveryUrl ?? options.openinaryUrl,
          options.thumbnailTransformations as Record<string, string>,
        );
        const filtered =
          req.query.filesOnly === "true"
            ? all.filter((item) => item.type === "file")
            : all;
        const limit = parseInteger(
          req.query.limit,
          100,
          "limit",
          MAX_LIST_LIMIT,
        );
        const start = req.query.cursor
          ? parseInteger(
              req.query.cursor,
              0,
              "cursor",
              Number.MAX_SAFE_INTEGER,
              0,
            )
          : 0;
        const items = filtered.slice(start, start + limit);
        res.status(200).json({
          items,
          nextCursor:
            start + items.length < filtered.length
              ? String(start + items.length)
              : undefined,
        });
        return;
      }
      if (req.method === "DELETE") {
        const rawId = req.query.id;
        if (typeof rawId !== "string" || !rawId)
          throw new Error("Missing media id");
        const id = assertMediaPath(rawId, options.mediaRoot);
        try {
          await client.delete(id);
        } catch (error) {
          console.error("Openinary media deletion failed", error);
          res.status(502).json({ error: "Media deletion failed" });
          return;
        }
        res.status(204).end();
        return;
      }
      if (req.method === "POST") {
        const parsed = await parseMultipart(req, options);
        parsedFiles = parsed.files;
        const requestedDirectory =
          parsed.directory || String(req.query.directory ?? "");
        const directory = assertMediaPath(
          requestedDirectory || options.mediaRoot || "",
          options.mediaRoot,
        );
        if (!parsed.files.length) {
          res.status(400).json({ error: "Missing upload file" });
          return;
        }
        const acceptedMimeTypes =
          options.acceptedMimeTypes ?? DEFAULT_ACCEPTED_MIME_TYPES;
        let results;
        try {
          results = [];
          for (const file of parsed.files) {
            const blob = Object.assign(
              new Blob([await readFile(file.filepath)], {
                type: file.mimetype ?? "application/octet-stream",
              }),
              { name: file.originalFilename ?? "upload" },
            );
            if (!(await isSafeUploadFile(blob, acceptedMimeTypes))) {
              res.status(415).json({ error: "Unsupported media type" });
              return;
            }
            results.push(...(await client.upload(directory, [blob])));
          }
        } catch (error) {
          console.error("Openinary media upload failed", error);
          res.status(502).json({ error: "Openinary upload failed" });
          return;
        }
        const items = results
          .filter(
            (result) =>
              result.success !== false && (result.path || result.name),
          )
          .map((result) =>
            mapUpload(
              result,
              directory,
              options.publicDeliveryUrl ?? options.openinaryUrl,
              options.thumbnailTransformations as Record<string, string>,
            ),
          );
        const warnings = results
          .filter(
            (result) =>
              result.success === false || !(result.path || result.name),
          )
          .map((result) => ({
            filename: result.name ?? "unknown",
            message: "Upload failed",
          }));
        if (!items.length) {
          res.status(502).json({ error: "Openinary upload failed" });
          return;
        }
        res
          .status(200)
          .json({ items, ...(warnings.length ? { warnings } : {}) });
        return;
      }
      res.setHeader("Allow", "GET, POST, DELETE");
      res.status(405).json({ error: "Method Not Allowed" });
    } catch (error) {
      const status =
        error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : isClientInputError(error)
          ? 400
          : 500;
      res.status(status).json({
        error:
          status >= 500
            ? "Media operation failed"
            : error instanceof Error
            ? error.message
            : "Media operation failed",
      });
    } finally {
      if (parsedFiles.length) await cleanupFiles(parsedFiles);
    }
  };
}
