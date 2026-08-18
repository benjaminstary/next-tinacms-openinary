import { assertMediaPath } from "./media-path.js";
import { mapListing, mapUpload } from "./media-mapper.js";
import { OpeninaryClient } from "./openinary-client.js";
import { isSafeUploadFile } from "./upload-validation.js";
import type { OpeninaryAppServerOptions } from "./types.js";

const MAX_LIST_LIMIT = 1000;
const DEFAULT_ACCEPTED_MIME_TYPES = ["image/*"];

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function parseInteger(
  value: string | null,
  fallback: number,
  name: string,
  maximum: number,
  minimum = 1,
): number {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`Malformed ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`Invalid ${name}`);
  return parsed;
}

function isClientInputError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^(Absolute media paths|Invalid media path|Media path outside|Malformed |Invalid |Missing |Unsupported )/.test(
      error.message,
    )
  );
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

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value;
}

function getFiles(form: FormData): File[] {
  return form.getAll("files").filter(isUploadFile);
}

function errorStatus(error: unknown): number {
  return error instanceof Error && "status" in error
    ? Number((error as { status: number }).status)
    : isClientInputError(error)
    ? 400
    : 500;
}

export function createAppMediaHandler(options: OpeninaryAppServerOptions) {
  const client = new OpeninaryClient(options);
  return async function appMediaHandler(request: Request): Promise<Response> {
    const authorization = options.authorized ?? options.authorize;
    if (!authorization)
      return json({ error: "Media authorization is not configured" }, 500);

    try {
      const url = new URL(request.url);
      if (request.method === "POST" || request.method === "DELETE") {
        const origin = request.headers.get("origin");
        const allowedOrigins = options.allowedOrigins ?? [url.origin];
        if (origin && !allowedOrigins.includes(origin))
          return json({ error: "Cross-origin request denied" }, 403);
      }
      const authorized = await withTimeout(
        (signal) => Promise.resolve(authorization(request, signal)),
        options.authorizationTimeoutMs ?? 10_000,
      );
      if (authorized === false) return json({ error: "Unauthorized" }, 401);

      if (request.method === "GET") {
        const directory = assertMediaPath(
          url.searchParams.get("directory") || options.mediaRoot || "",
          options.mediaRoot,
        );
        const all = mapListing(
          await client.list(directory),
          options.publicDeliveryUrl ?? options.openinaryUrl,
          options.thumbnailTransformations as Record<string, string>,
        );
        const filtered =
          url.searchParams.get("filesOnly") === "true"
            ? all.filter((item) => item.type === "file")
            : all;
        const limit = parseInteger(
          url.searchParams.get("limit"),
          100,
          "limit",
          MAX_LIST_LIMIT,
        );
        const start = url.searchParams.has("cursor")
          ? parseInteger(
              url.searchParams.get("cursor"),
              0,
              "cursor",
              Number.MAX_SAFE_INTEGER,
              0,
            )
          : 0;
        const items = filtered.slice(start, start + limit);
        return json({
          items,
          nextCursor:
            start + items.length < filtered.length
              ? String(start + items.length)
              : undefined,
        });
      }

      if (request.method === "DELETE") {
        const rawId = url.searchParams.get("id");
        if (!rawId) throw new Error("Missing media id");
        const id = assertMediaPath(rawId, options.mediaRoot);
        try {
          await client.delete(id);
        } catch (error) {
          console.error("Openinary media deletion failed", error);
          return json({ error: "Media deletion failed" }, 502);
        }
        return new Response(null, { status: 204 });
      }

      if (request.method === "POST") {
        const maxRequestSize =
          options.maxUploadRequestSize ??
          options.maxUploadTotalSize ??
          200 * 1024 * 1024;
        const contentLength = request.headers.get("content-length");
        if (
          contentLength !== null &&
          (!/^\d+$/.test(contentLength) ||
            Number(contentLength) > maxRequestSize)
        )
          return json({ error: "Upload request too large" }, 413);
        const form = await request.formData();
        const files = getFiles(form);
        const maxFiles = options.maxUploadFiles ?? 50;
        const maxFileSize = options.maxUploadFileSize ?? 100 * 1024 * 1024;
        const maxTotalSize = options.maxUploadTotalSize ?? 200 * 1024 * 1024;
        const fieldCount = Array.from(form.entries()).filter(
          ([key]) => key !== "files",
        ).length;
        if (fieldCount > (options.maxUploadFields ?? 10))
          throw new Error("Invalid upload fields");
        if (files.length > maxFiles) throw new Error("Invalid upload files");
        if (!files.length) throw new Error("Missing upload file");
        if (
          files.some((file) => file.size > maxFileSize) ||
          files.reduce((total, file) => total + file.size, 0) > maxTotalSize
        )
          throw new Error("Invalid upload size");

        const directory = assertMediaPath(
          String(form.get("directory") ?? "") ||
            url.searchParams.get("directory") ||
            options.mediaRoot ||
            "",
          options.mediaRoot,
        );
        const acceptedMimeTypes =
          options.acceptedMimeTypes ?? DEFAULT_ACCEPTED_MIME_TYPES;
        if (
          !(
            await Promise.all(
              files.map((file) => isSafeUploadFile(file, acceptedMimeTypes)),
            )
          ).every(Boolean)
        )
          throw new Error("Unsupported media type");

        let results;
        try {
          results = await client.upload(directory, files);
        } catch (error) {
          console.error("Openinary media upload failed", error);
          return json({ error: "Openinary upload failed" }, 502);
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
        if (!items.length)
          return json({ error: "Openinary upload failed" }, 502);
        return json({ items, ...(warnings.length ? { warnings } : {}) });
      }

      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, POST, DELETE" },
      });
    } catch (error) {
      const status = errorStatus(error);
      return json(
        {
          error:
            status >= 500
              ? "Media operation failed"
              : error instanceof Error
              ? error.message
              : "Media operation failed",
        },
        status,
      );
    }
  };
}
