import type {
  ListOptions,
  MediaUploadOptions,
  OpeninaryOptions,
  TinaMedia,
} from "./types.js";
export class OpeninaryMediaStore {
  readonly accept = "image/*";
  readonly maxSize = 100 * 1024 * 1024;
  constructor(private options: OpeninaryOptions = {}) {}
  private get url(): string {
    return this.options.proxyUrl ?? "/api/openinary/media";
  }
  protected fetchFunction: typeof fetch = (input, init) =>
    (this.options.fetch ?? fetch)(input, init);
  async list(
    options: ListOptions = {},
  ): Promise<{ items: TinaMedia[]; nextOffset?: string }> {
    const query = new URLSearchParams();
    if (options.directory) query.set("directory", options.directory);
    if (options.limit) query.set("limit", String(options.limit));
    if (options.offset !== undefined)
      query.set("cursor", String(options.offset));
    if (options.filesOnly) query.set("filesOnly", "true");
    const response = await this.fetchFunction(`${this.url}?${query}`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(await response.text());
    const result = (await response.json()) as {
      items: TinaMedia[];
      nextCursor?: string;
    };
    return { items: result.items, nextOffset: result.nextCursor };
  }
  async persist(files: MediaUploadOptions[]): Promise<TinaMedia[]> {
    const uploaded: TinaMedia[] = [];
    for (const { directory, file } of files) {
      const form = new FormData();
      form.set("directory", directory);
      form.append("files", file, file.name);
      const response = await this.fetchFunction(this.url, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await response.text());
      uploaded.push(
        ...((await response.json()) as { items: TinaMedia[] }).items,
      );
    }
    return uploaded;
  }
  async delete(media: TinaMedia): Promise<void> {
    const response = await this.fetchFunction(
      `${this.url}?id=${encodeURIComponent(media.id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    if (!response.ok) throw new Error(await response.text());
  }
  parse(media: TinaMedia): string {
    return media.src;
  }
}
