import {
  encodeMediaPath,
  joinMediaPath,
  normalizeMediaPath,
  resolveDeliveryUrl,
} from "./media-path.js";
import type { OpeninaryEntry, TinaMedia } from "./types.js";
function entryPath(entry: string | OpeninaryEntry): string {
  return typeof entry === "string" ? entry : entry.path;
}
function media(
  path: string,
  type: "file" | "dir",
  origin: string,
  explicit?: string,
  transforms?: Record<string, string>,
): TinaMedia {
  const id = normalizeMediaPath(path);
  const parts = id.split("/");
  const filename = parts.at(-1) ?? "";
  const directory = parts.slice(0, -1).join("/");
  const explicitSrc = explicit
    ? new URL(explicit, `${origin.replace(/\/$/, "")}/`).toString()
    : undefined;
  const src =
    explicitSrc &&
    (type !== "file" || new URL(explicitSrc).pathname.startsWith("/t/"))
      ? explicitSrc
      : resolveDeliveryUrl(
          origin,
          encodeMediaPath(type === "file" ? `t/${id}` : id),
        );
  const image =
    type === "file" && /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(filename);
  const thumb = (size: string) => {
    if (!image) return src;
    const [width, height] = size.split("x");
    const transformation = transforms?.[size] ?? `w_${width},h_${height},c_fit`;
    return src.replace("/t/", `/t/${transformation}/`);
  };
  return {
    id,
    type,
    filename,
    directory,
    src,
    thumbnails: {
      "75x75": thumb("75x75"),
      "400x400": thumb("400x400"),
      "1000x1000": thumb("1000x1000"),
    },
  };
}
export function mapListing(
  listing: {
    folders?: Array<string | OpeninaryEntry>;
    files?: Array<string | OpeninaryEntry>;
  },
  origin: string,
  transforms?: Record<string, string>,
): TinaMedia[] {
  const folders = (listing.folders ?? []).map((x) =>
    media(
      entryPath(x),
      "dir",
      origin,
      typeof x === "string" ? undefined : x.url,
      transforms,
    ),
  );
  const files = (listing.files ?? []).map((x) =>
    media(
      entryPath(x),
      "file",
      origin,
      typeof x === "string" ? undefined : x.url,
      transforms,
    ),
  );
  return [...folders, ...files].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id),
  );
}
export function mapUpload(
  result: { path?: string; url?: string; name?: string },
  directory: string,
  origin: string,
  transforms?: Record<string, string>,
): TinaMedia {
  return media(
    result.path ?? joinMediaPath(directory, result.name ?? ""),
    "file",
    origin,
    result.url,
    transforms,
  );
}
