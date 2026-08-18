# next-tinacms-openinary

TinaCMS external media store for Openinary Cloud and self-hosted Openinary.

Use it when Tina editors need to browse, upload, select, and delete media stored by Openinary.

## Features

- TinaCMS `MediaStore` compatibility.
- Native App Router media handler.
- Pages Router media handler for existing Pages Router applications.
- Root and nested folder browsing.
- Multi-file upload.
- File deletion by stable media ID.
- Openinary delivery URLs and image thumbnails.
- Tina Cloud token-aware fetch wrapper.
- Server-only Openinary API key.
- Openinary Cloud and self-hosted support.
- Deterministic pagination over Openinary one-level listings.
- Path traversal and media-root protection.

## Install

```bash
pnpm add next-tinacms-openinary
```

For the Pages Router example, also install `@tinacms/auth` or use your own authorization integration:

```bash
pnpm add @tinacms/auth
```

The package requires:

- Next.js `>=12` for the server handler.
- TinaCMS `>=1` as a peer dependency.
- Node.js runtime for the server media handler.

## App Router applications

App Router applications use a native route handler:

```text
app/                         # your normal App Router pages
app/api/openinary/media/     # native media endpoint
  route.ts
tina/config.ts               # Tina store registration
```

Create [`app/api/openinary/media/route.ts`](README.md:101) as described in [App Router media route](#app-router-media-route). The handler uses Web [`Request`](src/app-router-handler.ts:84) and [`Response`](src/app-router-handler.ts:12) objects and keeps Openinary secrets on the server.

## Pages Router applications

Pages Router applications can use the legacy [`createMediaHandler()`](src/handlers.ts:105) API route and Tina [`loadCustomStore`](https://tina.io/docs/reference/media-store/) configuration:

```text
pages/api/openinary/media.ts
  -> createMediaHandler()
  -> TinaCloudOpeninaryMediaStore
```

## Environment variables

Set these variables in the consuming Next.js application:

```env
# Server-only. Never use NEXT_PUBLIC_ prefix.
OPENINARY_URL=https://openinary.example.com
OPENINARY_API_KEY=server-only-openinary-api-key
```

[`OPENINARY_URL`](README.md:67) is the Openinary public/API origin used by the server media handler. [`OPENINARY_API_KEY`](README.md:68) must exist only in the server environment.

## Tina configuration

Use [`TinaCloudOpeninaryMediaStore`](src/openinary-tina-cloud-media-store.ts:14) from Tina config. This wrapper receives Tina's client and uses `client.authProvider.fetchWithToken()` for media requests.

```ts
// tina/config.ts
import { defineConfig } from "tinacms";

export default defineConfig({
  media: {
    loadCustomStore: async () => {
      const { TinaCloudOpeninaryMediaStore } = await import(
        "next-tinacms-openinary"
      );

      return TinaCloudOpeninaryMediaStore;
    },
  },
  // branch, schema, and other Tina configuration
});
```

Do not return [`OpeninaryMediaStore`](src/openinary-media-store.ts:7) directly when Tina Cloud authorization is required. Use [`TinaCloudOpeninaryMediaStore`](src/openinary-tina-cloud-media-store.ts:14).

## App Router media route

Create [`app/api/openinary/media/route.ts`](README.md:101) in the consuming application:

```ts
import { createAppMediaHandler } from "next-tinacms-openinary/app-router";
import { authorizeTinaRequest } from "@/lib/authorize-tina-request";

const handler = createAppMediaHandler({
  openinaryUrl: process.env.OPENINARY_URL!,
  openinaryApiKey: process.env.OPENINARY_API_KEY!,
  authorized: authorizeTinaRequest,
});

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
```

The `authorized` callback must validate the current user/session in your application. It receives the Web [`Request`](src/app-router-handler.ts:84) and must return `false` for unauthorized requests.

The route performs operations in this order:

```text
Tina token authorization
  -> Openinary API request with server-only API key
  -> mapped Tina media response
```

The browser calls only `/api/openinary/media`. It never calls Openinary directly.

## Pages Router media route

Existing Pages Router applications can keep using [`createMediaHandler()`](src/handlers.ts:105):

```ts
import type { NextApiRequest } from "next";
import { isAuthorized } from "@tinacms/auth";
import { createMediaHandler } from "next-tinacms-openinary/handlers";

export const config = { api: { bodyParser: false } };

export default createMediaHandler({
  openinaryUrl: process.env.OPENINARY_URL!,
  openinaryApiKey: process.env.OPENINARY_API_KEY!,
  authorized: async (request) => {
    const user = await isAuthorized(request as NextApiRequest);
    return Boolean(user?.verified);
  },
});
```

Use the App Router handler for new App Router applications. The Pages Router handler remains available for backward compatibility.

## Image URLs and optimization

Openinary source media is stored in Tina as the original delivery URL:

```text
https://openinary.example.com/t/file.webp
```

Tina thumbnail URLs use Openinary transformations:

```text
https://openinary.example.com/t/w_75,h_75,c_fit/file.webp
https://openinary.example.com/t/w_400,h_400,c_fit/file.webp
https://openinary.example.com/t/w_1000,h_1000,c_fit/file.webp
```

Choose one public image optimizer. If Openinary is the optimizer, generate width/format/quality URLs such as:

```text
https://openinary.example.com/t/w_800,f_auto,q_auto/file.webp
```

Do not send the same image through another optimizer unless that service is intentionally the sole public optimizer.

`f_auto` lets Openinary choose the best supported format. `q_auto` selects automatic quality.

## Openinary client options

### Browser-side store

[`OpeninaryMediaStore`](src/openinary-media-store.ts:7) is a browser-safe Tina media store. It sends media operations to your local proxy endpoint; it does not receive or expose the Openinary API key.

```ts
new OpeninaryMediaStore({
  proxyUrl: "/api/openinary/media",
});
```

Options:

- [`proxyUrl`](src/types.ts:4): local application endpoint that receives Tina media requests. Defaults to `/api/openinary/media`.
- [`fetch`](src/types.ts:5): optional replacement for browser `fetch`, useful when an existing integration adds authentication, headers, tracing, or custom request behavior.

Use this store when a custom browser fetch/auth integration already exists. For Tina Cloud authorization, prefer [`TinaCloudOpeninaryMediaStore`](src/openinary-tina-cloud-media-store.ts:14), which uses Tina's token-aware fetch method.

### Server-side handler

[`createAppMediaHandler()`](src/app-router-handler.ts:84) and [`createMediaHandler()`](src/handlers.ts:105) accept the same Openinary connection and media configuration. The App Router handler uses [`OpeninaryAppServerOptions`](src/types.ts:38), whose authorization callback receives a Web [`Request`](src/app-router-handler.ts:84). The Pages Router handler uses [`OpeninaryServerOptions`](src/types.ts:15), whose authorization callback receives Next.js request and response objects.

- [`openinaryUrl`](src/types.ts:8): Openinary API and public origin.
- [`openinaryApiKey`](src/types.ts:9): server-only Openinary API key.
- [`authorized`](src/types.ts:14) or legacy [`authorize`](src/types.ts:10): request authorization callback.
- [`mediaRoot`](src/types.ts:18): logical path boundary for shared deployments.
- [`publicDeliveryUrl`](src/types.ts:19): optional separate public delivery origin.
- [`acceptedMimeTypes`](src/types.ts:21): accepted upload MIME types; defaults to `['image/*']`.
- [`thumbnailTransformations`](src/types.ts:28): Openinary thumbnail transformation configuration.

Do not pass server options or API keys to browser-side [`OpeninaryMediaStore`](src/openinary-media-store.ts:7).

## Openinary storage providers

[Openinary documentation](https://docs.openinary.dev/) covers local storage and S3-compatible storage providers such as Hetzner Object Storage.

Configure storage on Openinary, not in this Tina adapter:

```env
STORAGE_REGION=fsn1
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_BUCKET_NAME=...
STORAGE_ENDPOINT=https://fsn1.your-objectstorage.com
STORAGE_PUBLIC_URL=https://media.example.com
```

## Security

- Keep [`OPENINARY_API_KEY`](README.md:68) server-only.
- Keep Hetzner/S3 credentials inside Openinary server configuration.
- Gate every proxy operation with Tina authorization.
- Use separate Openinary deployments for unrelated clients.
- Use [`mediaRoot`](src/types.ts:18) only as logical isolation for trusted shared deployments.
- Rotate keys exposed in chat, logs, screenshots, or source control.
