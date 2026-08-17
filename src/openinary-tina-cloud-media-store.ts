import { OpeninaryMediaStore } from "./openinary-media-store.js";
import type { OpeninaryOptions } from "./types.js";

export interface TinaClientLike {
  clientId: string;
  authProvider: {
    fetchWithToken(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response>;
  };
}

export class TinaCloudOpeninaryMediaStore extends OpeninaryMediaStore {
  constructor(client: TinaClientLike, options: OpeninaryOptions = {}) {
    super(options);
    this.fetchFunction = async (input, init) => {
      return client.authProvider.fetchWithToken(
        appendClientId(input.toString(), client.clientId),
        init,
      );
    };
  }
}
function appendClientId(input: string, clientId: string): string {
  const hashIndex = input.indexOf("#");
  const hash = hashIndex === -1 ? "" : input.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const base =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = new URLSearchParams(
    queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1),
  );
  query.set("clientID", clientId);
  return `${base}?${query}${hash}`;
}

export function createTinaCloudOpeninaryMediaStore(
  options: OpeninaryOptions = {},
): typeof TinaCloudOpeninaryMediaStore {
  return class ConfiguredTinaCloudOpeninaryMediaStore extends TinaCloudOpeninaryMediaStore {
    constructor(client: TinaClientLike) {
      super(client, options);
    }
  };
}
