import { responseError } from "./errors.js";
import { normalizeMediaPath, resolveDeliveryUrl } from "./media-path.js";
import type {
  OpeninaryListing,
  OpeninaryClientOptions,
  OpeninaryUploadResult,
} from "./types.js";
export class OpeninaryClient {
  private fetcher: typeof fetch;
  constructor(private options: OpeninaryClientOptions) {
    this.fetcher = options.fetch ?? fetch;
  }
  private url(path: string): string {
    return `${this.options.openinaryUrl.replace(/\/$/, "")}/${path.replace(
      /^\//,
      "",
    )}`;
  }
  private async request(path: string, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const retryable =
      method === "GET" || method === "HEAD" || method === "OPTIONS";
    const maxRetries = retryable
      ? Math.max(0, Math.min(3, this.options.maxRequestRetries ?? 2))
      : 0;
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.requestTimeoutMs ?? 10_000,
      );
      const abort = () => controller.abort();
      init?.signal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await this.fetcher(this.url(path), {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.options.openinaryApiKey}`,
            ...(init?.headers ?? {}),
          },
        });
        if (response.ok) return response;
        if (
          attempt < maxRetries &&
          (response.status === 429 || response.status >= 500)
        ) {
          await response.body?.cancel();
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * 2 ** attempt),
          );
          continue;
        }
        throw await responseError(response);
      } finally {
        clearTimeout(timeout);
        init?.signal?.removeEventListener("abort", abort);
      }
    }
  }
  async list(path: string): Promise<OpeninaryListing> {
    const response = await this.request(
      `api/storage?path=${encodeURIComponent(normalizeMediaPath(path))}`,
    );
    return (await response.json()) as OpeninaryListing;
  }
  async upload(
    directory: string,
    files: Array<Blob & { name: string }>,
  ): Promise<OpeninaryUploadResult[]> {
    const form = new FormData();
    form.set("folder", normalizeMediaPath(directory));
    for (const file of files) form.append("files", file, file.name);
    const response = await this.request("api/upload", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as
      | OpeninaryUploadResult[]
      | { files?: OpeninaryUploadResult[]; results?: OpeninaryUploadResult[] };
    return Array.isArray(body) ? body : body.files ?? body.results ?? [];
  }
  async delete(path: string): Promise<void> {
    await this.request(
      `api/storage/${normalizeMediaPath(path)
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { method: "DELETE" },
    );
  }
  delivery(path: string): string {
    return resolveDeliveryUrl(
      this.options.publicDeliveryUrl ?? this.options.openinaryUrl,
      path,
    );
  }
}
