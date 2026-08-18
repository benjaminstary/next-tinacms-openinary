import { describe, expect, it } from "vitest";
import { createAppMediaHandler } from "../src/app-router-handler.js";

const options = {
  openinaryUrl: "https://openinary.example",
  openinaryApiKey: "secret",
  authorized: () => true,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("native App Router media handler", () => {
  it("lists media through a Web Request and Response", async () => {
    const handler = createAppMediaHandler({
      ...options,
      fetch: async (input) => {
        expect(String(input)).toContain("api/storage?path=");
        return response({ files: [{ path: "photo.jpg" }] });
      },
    });

    const result = await handler(
      new Request("https://example.test/api/openinary/media?filesOnly=true"),
    );

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      items: [{ id: "photo.jpg", type: "file" }],
    });
  });

  it("authorizes requests before calling Openinary", async () => {
    let called = false;
    const handler = createAppMediaHandler({
      ...options,
      authorized: () => false,
      fetch: async () => {
        called = true;
        return response({});
      },
    });

    const result = await handler(
      new Request("https://example.test/api/openinary/media"),
    );

    expect(result.status).toBe(401);
    expect(called).toBe(false);
  });

  it("supports multipart uploads", async () => {
    const handler = createAppMediaHandler({
      ...options,
      fetch: async (input, init) => {
        expect(String(input)).toContain("api/upload");
        expect(init?.method).toBe("POST");
        return response([{ path: "photo.jpg", success: true }]);
      },
    });
    const form = new FormData();
    form.set("directory", "gallery");
    form.append(
      "files",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "photo.jpg", {
        type: "image/jpeg",
      }),
    );

    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "POST",
        body: form,
      }),
    );

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      items: [{ id: "photo.jpg" }],
    });
  });

  it("deletes media and returns no content", async () => {
    const handler = createAppMediaHandler({
      ...options,
      fetch: async (input, init) => {
        expect(String(input)).toContain("api/storage/photo.jpg");
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    });

    const result = await handler(
      new Request("https://example.test/api/openinary/media?id=photo.jpg", {
        method: "DELETE",
      }),
    );

    expect(result.status).toBe(204);
  });

  it("rejects invalid delete paths before calling Openinary", async () => {
    let called = false;
    const handler = createAppMediaHandler({
      ...options,
      fetch: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    });

    const result = await handler(
      new Request("https://example.test/api/openinary/media?id=../secret", {
        method: "DELETE",
      }),
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("rejects cross-origin mutations", async () => {
    const handler = createAppMediaHandler(options);
    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "DELETE",
        headers: { Origin: "https://evil.example" },
      }),
    );

    expect(result.status).toBe(403);
  });

  it("rejects SVG uploads by default", async () => {
    const handler = createAppMediaHandler(options);
    const form = new FormData();
    form.append(
      "files",
      new File(["<svg><script>alert(1)</script></svg>"], "x.svg", {
        type: "image/svg+xml",
      }),
    );

    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "POST",
        body: form,
      }),
    );

    expect(result.status).toBe(400);
  });

  it("counts repeated multipart fields toward the field limit", async () => {
    const handler = createAppMediaHandler({
      ...options,
      maxUploadFields: 1,
    });
    const form = new FormData();
    form.append(
      "files",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
        type: "image/jpeg",
      }),
    );
    form.append("directory", "one");
    form.append("directory", "two");

    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "POST",
        body: form,
      }),
    );

    expect(result.status).toBe(400);
  });

  it("rejects unknown image formats by default", async () => {
    const handler = createAppMediaHandler(options);
    const form = new FormData();
    form.append(
      "files",
      new File(["not an image"], "photo.tiff", { type: "image/tiff" }),
    );

    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "POST",
        body: form,
      }),
    );

    expect(result.status).toBe(400);
  });

  it("rejects oversized requests before multipart parsing", async () => {
    const handler = createAppMediaHandler({
      ...options,
      maxUploadRequestSize: 10,
    });
    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "POST",
        headers: { "content-length": "11" },
        body: "too large",
      }),
    );

    expect(result.status).toBe(413);
  });

  it("returns Allow for unsupported methods", async () => {
    const handler = createAppMediaHandler(options);
    const result = await handler(
      new Request("https://example.test/api/openinary/media", {
        method: "PATCH",
      }),
    );

    expect(result.status).toBe(405);
    expect(result.headers.get("Allow")).toBe("GET, POST, DELETE");
  });
});
