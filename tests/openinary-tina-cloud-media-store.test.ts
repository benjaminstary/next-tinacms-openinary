import { describe, expect, it, vi } from "vitest";
import {
  TinaCloudOpeninaryMediaStore,
  createTinaCloudOpeninaryMediaStore,
} from "../src/openinary-tina-cloud-media-store.js";

describe("Tina Cloud media store", () => {
  it("preserves existing queries and replaces duplicate client IDs", async () => {
    const fetchWithToken = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const store = new TinaCloudOpeninaryMediaStore(
      { clientId: "client id", authProvider: { fetchWithToken } },
      {
        proxyUrl: "/media?directory=photos&clientID=old",
        fetch: fetchWithToken,
      },
    );

    await store.list();
    expect(fetchWithToken).toHaveBeenCalledWith(
      "/media?directory=photos&clientID=client+id",
      expect.anything(),
    );
  });

  it("applies factory options to returned store class", async () => {
    const fetchWithToken = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const ConfiguredStore = createTinaCloudOpeninaryMediaStore({
      proxyUrl: "/configured",
      fetch: fetchWithToken,
    });
    const store = new ConfiguredStore({
      clientId: "client",
      authProvider: { fetchWithToken },
    });

    await store.list();
    expect(fetchWithToken).toHaveBeenCalledWith(
      "/configured?clientID=client",
      expect.anything(),
    );
  });
});
