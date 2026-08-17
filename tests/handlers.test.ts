import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  formidable: vi.fn(),
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("formidable", () => ({ default: mocks.formidable }));
vi.mock("../src/openinary-client.js", () => ({
  OpeninaryClient: class {
    list = mocks.list;
    upload = mocks.upload;
    delete = mocks.remove;
  },
}));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  unlink: mocks.unlink,
}));

import { createMediaHandler } from "../src/handlers.js";

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

const options = {
  openinaryUrl: "https://openinary.example",
  openinaryApiKey: "secret",
  authorized: async () => true,
};

describe("media handler boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ files: [] });
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.unlink.mockResolvedValue(undefined);
  });

  it("returns 401 for failed authorization", async () => {
    const res = response();
    const handler = createMediaHandler({
      ...options,
      authorized: async () => false,
    });

    await handler({ method: "GET", query: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when authorization throws", async () => {
    const res = response();
    const handler = createMediaHandler({
      ...options,
      authorized: async () => {
        throw new Error("provider detail");
      },
    });

    await handler({ method: "GET", query: {} } as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Media operation failed" });
  });

  it("times out stalled authorization", async () => {
    const res = response();
    const handler = createMediaHandler({
      ...options,
      authorizationTimeoutMs: 1,
      authorized: () => new Promise<boolean>(() => undefined),
    });

    await handler({ method: "GET", query: {} } as never, res as never);

    expect(res.statusCode).toBe(500);
  });

  it("rejects malformed and oversized pagination values", async () => {
    for (const query of [
      { limit: "1.5" },
      { limit: "1001" },
      { cursor: "x" },
    ]) {
      const res = response();
      const handler = createMediaHandler(options);

      await handler({ method: "GET", query } as never, res as never);

      expect(res.statusCode).toBe(400);
    }
  });

  it("passes explicit multipart limits to Formidable", async () => {
    mocks.formidable.mockReturnValue({
      parse: (_req: unknown, callback: Function) =>
        callback(null, { directory: "photos" }, { files: [] }),
    });
    const res = response();
    const handler = createMediaHandler({
      ...options,
      maxUploadFileSize: 10,
      maxUploadTotalSize: 20,
      maxUploadFields: 2,
      maxUploadFiles: 3,
    });

    await handler({ method: "POST", query: {} } as never, res as never);

    expect(mocks.formidable).toHaveBeenCalledWith(
      expect.objectContaining({
        maxFileSize: 10,
        maxTotalFileSize: 20,
        maxFields: 2,
        maxFiles: 3,
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns successful uploads with failed-file warnings", async () => {
    mocks.formidable.mockReturnValue({
      parse: (_req: unknown, callback: Function) =>
        callback(
          null,
          { directory: "photos" },
          {
            files: {
              filepath: "/tmp/upload.jpg",
              originalFilename: "upload.jpg",
              mimetype: "image/jpeg",
            },
          },
        ),
    });
    mocks.upload.mockResolvedValue([
      { path: "photos/success.jpg", name: "success.jpg", success: true },
      { name: "failed.jpg", success: false },
    ]);
    const res = response();
    const handler = createMediaHandler(options);

    await handler({ method: "POST", query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      warnings: [{ filename: "failed.jpg", message: "Upload failed" }],
    });
    expect(mocks.unlink).toHaveBeenCalledWith("/tmp/upload.jpg");
  });

  it("rejects non-image uploads by default", async () => {
    mocks.formidable.mockReturnValue({
      parse: (_req: unknown, callback: Function) =>
        callback(
          null,
          { directory: "photos" },
          {
            files: {
              filepath: "/tmp/audio.mp3",
              originalFilename: "audio.mp3",
              mimetype: "audio/mpeg",
            },
          },
        ),
    });
    const res = response();
    const handler = createMediaHandler(options);

    await handler({ method: "POST", query: {} } as never, res as never);

    expect(res.statusCode).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("cleans parsed files when multipart parsing fails", async () => {
    const file = { filepath: "/tmp/partial.jpg" };
    mocks.formidable.mockReturnValue({
      parse: (_req: unknown, callback: Function) =>
        callback(new Error("max file size"), {}, { files: file }),
    });
    const res = response();
    const handler = createMediaHandler(options);

    await handler({ method: "POST", query: {} } as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(mocks.unlink).toHaveBeenCalledWith("/tmp/partial.jpg");
  });

  it("returns safe delete errors", async () => {
    mocks.remove.mockRejectedValue(new Error("provider secret"));
    const res = response();
    const handler = createMediaHandler(options);

    await handler(
      { method: "DELETE", query: { id: "photos/file.jpg" } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "Media deletion failed" });
  });
});
