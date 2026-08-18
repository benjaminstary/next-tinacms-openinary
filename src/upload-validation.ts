export function isAcceptedMimeType(
  mimeType: string,
  accepted: string[],
): boolean {
  return accepted.some((pattern) =>
    pattern.endsWith("/*")
      ? mimeType.startsWith(pattern.slice(0, -1))
      : mimeType === pattern,
  );
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export async function isSafeUploadFile(
  file: Blob,
  accepted: string[],
): Promise<boolean> {
  if (!isAcceptedMimeType(file.type, accepted)) return false;
  if (file.type === "image/svg+xml") return false;
  if (!file.type.startsWith("image/")) return true;

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png")
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (file.type === "image/gif")
    return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  if (file.type === "image/bmp") return startsWith(bytes, [0x42, 0x4d]);
  if (file.type === "image/webp")
    return (
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
    );
  if (file.type === "image/avif")
    return startsWith(bytes.slice(4), [0x66, 0x74, 0x79, 0x70]);
  return false;
}
