export class OpeninaryError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "OpeninaryError";
  }
}
export async function responseError(
  response: Response,
): Promise<OpeninaryError> {
  const text = await response.text().catch(() => "");
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep plain-text provider errors available to callers.
  }
  const message =
    typeof body === "object" && body !== null
      ? String(
          (body as Record<string, unknown>).error ??
            (body as Record<string, unknown>).message ??
            response.statusText,
        )
      : String(body || response.statusText);
  return new OpeninaryError(response.status, message, body);
}
