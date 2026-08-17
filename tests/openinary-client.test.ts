import { describe, expect, it, vi } from "vitest";
import { OpeninaryClient } from "../src/openinary-client.js";

describe("OpeninaryClient resilience", () => {
  it("retries transient listing failures and stops at configured bound", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [] }), { status: 200 }),
      );
    const client = new OpeninaryClient({
      openinaryUrl: "https://openinary.example",
      openinaryApiKey: "secret",
      fetch: fetcher,
      maxRequestRetries: 1,
      requestTimeoutMs: 1000,
    });

    await expect(client.list("photos")).resolves.toEqual({ files: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-idempotent uploads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 503 }));
    const client = new OpeninaryClient({
      openinaryUrl: "https://openinary.example",
      openinaryApiKey: "secret",
      fetch: fetcher,
    });

    await expect(
      client.upload("photos", [
        new Blob(["data"], { type: "text/plain" }) as Blob & { name: string },
      ]),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves malformed JSON errors after receiving a response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    const client = new OpeninaryClient({
      openinaryUrl: "https://openinary.example",
      openinaryApiKey: "secret",
      fetch: fetcher,
    });

    await expect(client.list("photos")).rejects.toThrow();
  });
});
