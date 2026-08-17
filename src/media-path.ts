export function normalizeMediaPath(input = ""): string {
  if (/^[/\\]+$/.test(input)) return "";
  if (input.startsWith("/") || input.startsWith("\\"))
    throw new Error("Absolute media paths are not allowed");
  const value = input
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  if (value.split("/").some((part) => part === "." || part === ".."))
    throw new Error("Invalid media path");
  return value;
}
export function assertMediaPath(input: string, root?: string): string {
  const path = normalizeMediaPath(input);
  const base = root ? normalizeMediaPath(root) : "";
  if (base && path !== base && !path.startsWith(`${base}/`))
    throw new Error("Media path outside configured root");
  return path;
}
export function encodeMediaPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
export function joinMediaPath(directory: string, filename: string): string {
  return normalizeMediaPath([directory, filename].filter(Boolean).join("/"));
}
export function resolveDeliveryUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, "")}/`).toString();
}
