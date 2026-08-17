# next-tinacms-openinary

TinaCMS external media store for Openinary Cloud and self-hosted Openinary.

Use it when Tina editors need to browse, upload, select, and delete media stored by Openinary.

## Features

- TinaCMS `MediaStore` compatibility.
- Root and nested folder browsing.
- Multi-file upload.
- File deletion by stable media ID.
- Openinary delivery URLs and image thumbnails.
- Tina Cloud token-aware fetch wrapper.
- Server-only Openinary API key.
- Openinary Cloud and self-hosted support.
- Pages Router media proxy compatible with App Router sites.
- Deterministic pagination over Openinary one-level listings.
- Path traversal and media-root protection.

## Install

```bash
pnpm add next-tinacms-openinary
pnpm add @tinacms/auth
```

The package requires:

- Next.js `>=12` for the server handler.
- TinaCMS `>=1` as a peer dependency.
- Node.js runtime for the Pages API handler.

## Environment variables

Set these variables in the consuming Next.js application:

```env
# Server-only. Never use NEXT_PUBLIC_ prefix.
OPENINARY_URL=https://openinary.example.com
OPENINARY_API_KEY=server-only-openinary-api-key

# Public origin only. Safe to expose in browser code.
NEXT_PUBLIC_OPENINARY_URL=https://openinary.example.com
```

`OPENINARY_URL` must point to the Openinary public/API origin. `OPENINARY_API_KEY` must exist only in the server environment.

## Tina configuration

Use `TinaCloudOpeninaryMediaStore` from Tina config. This wrapper receives Tina's client and uses `client.authProvider.fetchWithToken()` for media requests, matching the Cloudinary integration pattern.

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

Do not return `OpeninaryMediaStore` directly when Tina Cloud authorization is required. Use `TinaCloudOpeninaryMediaStore`.

## Media proxy route

Create `pages/api/openinary/media.ts` in the consuming application:

```ts
import type { NextApiRequest } from "next";
import { isAuthorized } from "@tinacms/auth";
import { createMediaHandler } from "next-tinacms-openinary/handlers";

export const config = { api: { bodyParser: false } };

export default createMediaHandler({
  openinaryUrl: process.env.OPENINARY_URL!,
  openinaryApiKey: process.env.OPENINARY_API_KEY!,
  authorized: async (request) => {
    // Local Tina development only.
    if (process.env.NEXT_PUBLIC_USE_LOCAL_CLIENT === "1") return true;

    const user = await isAuthorized(request as NextApiRequest);
    return Boolean(user?.verified);
  },
});
```

The route performs operations in this order:

```text
Tina token authorization
  -> Openinary API request with server-only API key
  -> mapped Tina media response
```

The browser calls only `/api/openinary/media`. It never calls Openinary directly.

### Local development

For local Tina development, you may set:

```env
NEXT_PUBLIC_USE_LOCAL_CLIENT=1
```

Remove this variable in production. Production must validate Tina authorization through `@tinacms/auth`.

Deployment checklist:

- Run `npm run check:production-auth` during production build/deploy validation.
- Ensure `NODE_ENV=production` and `NEXT_PUBLIC_USE_LOCAL_CLIENT` is absent or not `1`.
- Confirm production requests use Tina authorization; local bypass is development-only.

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

### Openinary `next/image` loader

Create `loader.js` in the consuming Next.js project. This loader receives the width requested by `next/image` and turns an original Openinary URL into a transformed Openinary URL:

```js
/* global process, URL */

"use client";

export default function openinaryImageLoader({ src, width, quality }) {
  const openinaryUrl = (
    process.env.NEXT_PUBLIC_OPENINARY_URL || "https://openinary.example.com"
  ).replace(/\/$/, "");

  try {
    const source = new URL(src, openinaryUrl);
    const origin = new URL(openinaryUrl);

    if (source.origin === origin.origin && source.pathname.startsWith("/t/")) {
      const assetPath = source.pathname.slice("/t/".length);
      const transform = `w_${width},f_auto,q_${quality || "auto"}`;
      return `${openinaryUrl}/t/${transform}/${assetPath}`;
    }
  } catch {
    // Keep non-Openinary URLs unchanged.
  }

  return src;
}
```

Connect the loader in your `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./loader.js",
  },
};

export default nextConfig;
```

Use normal original Openinary URLs in your Tina fields:

```tsx
import Image from "next/image";

export function HeroImage({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={1200} height={800} />;
}
```

For an original value of `https://openinary.example.com/t/hero.jpg`, a request with `width={800}` produces:

```text
https://openinary.example.com/t/w_800,f_auto,q_auto/hero.jpg
```

`f_auto` lets Openinary choose the best supported format. `q_auto` selects automatic quality. The loader is public and contains no Openinary secret; only the origin is exposed.

## Openinary client options

Browser-safe `OpeninaryMediaStore` accepts:

```ts
new OpeninaryMediaStore({
  proxyUrl: "/api/openinary/media",
});
```

Use this direct store when a custom fetch/auth integration is already available. For Tina Cloud, prefer `TinaCloudOpeninaryMediaStore`.

Server `createMediaHandler()` accepts:

- `openinaryUrl`
- `openinaryApiKey`
- `authorized` or legacy `authorize` callback
- `mediaRoot`
- `publicDeliveryUrl`
- `acceptedMimeTypes` (defaults to `['image/*']`; set explicitly to broaden uploads)
- `thumbnailTransformations`

## Openinary storage providers

Openinary can use local storage or S3-compatible providers such as Hetzner Object Storage. Configure storage on Openinary, not in this Tina adapter:

```env
STORAGE_REGION=fsn1
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_BUCKET_NAME=...
STORAGE_ENDPOINT=https://fsn1.your-objectstorage.com
STORAGE_PUBLIC_URL=https://media.example.com
```

## Security

- Keep `OPENINARY_API_KEY` server-only.
- Keep Hetzner/S3 credentials inside Openinary server configuration.
- Gate every proxy operation with Tina authorization.
- Do not deploy with `NEXT_PUBLIC_USE_LOCAL_CLIENT=1`.
- Use separate Openinary deployments for unrelated clients.
- Use `mediaRoot` only as logical isolation for trusted shared deployments.
- Rotate keys exposed in chat, logs, screenshots, or source control.

## Testing

Package checks:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Consumer checks:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm exec next build --turbopack
```

Manual Tina flow:

1. Open Tina Media Manager.
2. List root and nested folders.
3. Upload an image.
4. Insert it into a field.
5. Save the document.
6. Confirm preview remains current without browser refresh.
7. Reload and confirm the same URL.
8. Verify browser Network tab calls the local proxy, not Openinary directly.

## Examples

The package does not ship a standalone Next.js homepage. The API route shown above is a minimal copy-paste proxy reference.

Use the Pages Router and App Router sections above with your own existing Tina application. The App Router preview wrapper is included inline because it belongs to the consuming application and depends on its page queries and route variables.

## Pages Router applications

Pages Router applications use the API route above and the Tina `loadCustomStore` configuration. No preview bridge is required.

```text
pages/api/openinary/media.ts
  -> createMediaHandler()
  -> TinaCloudOpeninaryMediaStore
```

## App Router applications

The media handler is still a Pages Router API handler, but App Router applications can use it alongside `app/` routes:

```text
app/                 # your normal App Router pages
pages/api/openinary/ # Node-only media proxy
tina/config.ts       # Tina store registration
```

This hybrid approach keeps Openinary secrets and multipart parsing on the Node API route. The package does not currently expose a native App Router `Request`/`Response` handler.

## App Router Tina preview synchronization

Next App Router can refresh server props immediately after Tina saves. In some setups, those RSC props can briefly contain older content and overwrite Tina's live iframe state.

Add a small consumer-side route-aware `useTinaPreview` wrapper:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTina } from "tinacms/dist/react";

export function useTinaPreview<T extends Record<string, unknown>>(props: {
  query: string;
  variables: Record<string, unknown>;
  data: T;
  experimental___selectFormByFormId?: () => string;
}) {
  const identity = useMemo(
    () => JSON.stringify({ query: props.query, variables: props.variables }),
    [props.query, props.variables],
  );
  const [state, setState] = useState(() => ({
    identity,
    data: props.data,
  }));

  useEffect(() => {
    if (state.identity !== identity) {
      setState({ identity, data: props.data });
    }
  }, [identity, props.data, state.identity]);

  return useTina({
    ...props,
    data: state.identity === identity ? state.data : props.data,
  });
}
```

Use it in App Router client pages instead of direct `useTina()`:

```tsx
const { data } = useTinaPreview({
  query,
  variables,
  data,
  experimental___selectFormByFormId: () => "content/pages/home.json",
});
```

The wrapper:

- Preserves live Tina `updateData` state during same-route RSC refreshes.
- Resets state when query or route variables change.
- Avoids globally freezing initial data.

Use this only for App Router preview synchronization. It is a consumer integration helper, not part of the media adapter itself.
