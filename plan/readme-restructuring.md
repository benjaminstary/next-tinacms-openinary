# README Restructuring Plan

## Goal

Make [`README.md`](../README.md) user-focused, App Router-first, and clear about server/browser responsibilities. Remove historical, internal, and testing-oriented content.

## Scope

Update only [`README.md`](../README.md).

## Plan

### 1. Reframe package positioning

- Keep package purpose near the top.
- Update the feature list so App Router support appears first.
- Describe support as a hybrid App Router setup using `app/` routes with a `pages/api/` media proxy.
- Explain that native App Router [`Request`](../README.md:304)/[`Response`](../README.md:304) handler support is not currently provided.

### 2. Remove irrelevant example-page text

- Delete the [`Examples`](../README.md:286) section.
- Remove wording about the package not shipping a standalone homepage.
- Keep copy-paste integration examples because they directly help package users.

### 3. Reorder router documentation

Use this order:

1. App Router integration
2. Pages Router integration
3. Tina configuration
4. Media proxy route

Explain App Router setup first while keeping the existing Pages API proxy requirement visible.

### 4. Simplify environment variables

- Remove apparent duplication between [`OPENINARY_URL`](../README.md:40) and [`NEXT_PUBLIC_OPENINARY_URL`](../README.md:44).
- Keep [`OPENINARY_URL`](../README.md:40) as server-side configuration for [`createMediaHandler()`](../README.md:84).
- Remove [`NEXT_PUBLIC_OPENINARY_URL`](../README.md:44) if the image loader can derive the Openinary origin from absolute media URLs.
- If relative URLs require a public origin, document that as an optional, explicitly browser-visible setting rather than a second canonical URL.
- Preserve the server-only warning for [`OPENINARY_API_KEY`](../README.md:41).

### 5. Explain client options

Expand [`Openinary client options`](../README.md:211) with a short option reference:

- [`proxyUrl`](../src/openinary-media-store.ts:11): browser-safe local proxy endpoint. Keeps the Openinary API key on the server.
- [`fetch`](../src/openinary-media-store.ts:14): optional custom fetch implementation for existing authentication, headers, tracing, or request behavior.
- [`OpeninaryMediaStore`](../src/openinary-media-store.ts:7): browser-side store for custom integrations.
- [`TinaCloudOpeninaryMediaStore`](../src/openinary-tina-cloud-media-store.ts:14): preferred store when Tina Cloud authorization is used.
- [`OpeninaryServerOptions`](../src/types.ts:7), [`openinaryUrl`](../src/types.ts:8), and [`openinaryApiKey`](../src/types.ts:9): server-side handler configuration only.

Add a simple “which one should I use?” subsection:

- Tina Cloud: [`TinaCloudOpeninaryMediaStore`](../src/openinary-tina-cloud-media-store.ts:14)
- Custom browser authentication: [`OpeninaryMediaStore`](../src/openinary-media-store.ts:7) with [`proxyUrl`](../src/openinary-media-store.ts:11) and optionally [`fetch`](../src/openinary-media-store.ts:14)
- Server API access: [`createMediaHandler()`](../README.md:84) with server-only credentials

### 6. Link Openinary documentation

- Add a link to [Openinary documentation](https://docs.openinary.dev/) in [`Openinary storage providers`](../README.md:233).
- State that storage provider configuration belongs to Openinary, not this TinaCMS adapter.
- Keep the S3-compatible environment-variable example only if it remains useful to package consumers.

### 7. Remove testing references

Delete [`Testing`](../README.md:256), including:

- Package checks
- Consumer checks
- Manual Tina flow verification

Remove or rewrite [`check:production-auth`](../README.md:119) because it is an internal validation command, not package usage documentation. Keep production security requirements in [`Security`](../README.md:246).

### 8. Final README structure

1. Package overview
2. Features
3. Install
4. App Router applications
5. Pages Router applications
6. Environment variables
7. Tina configuration
8. Media proxy route
9. Image URLs and optimization
10. Openinary client options
11. Openinary storage providers
12. Security

## Acceptance criteria

- No standalone example-page discussion remains.
- App Router appears before Pages Router and is presented as primary usage.
- README clearly states hybrid App Router plus Pages API behavior.
- Duplicate Openinary URL configuration is removed or clearly justified as optional.
- Every [`OpeninaryMediaStore`](../src/openinary-media-store.ts:7) option is explained in plain language.
- Openinary documentation link is present.
- Testing section and maintainer-oriented checks are absent.
- API-key handling and production authorization warnings remain clear.
- README contains no inaccurate claim that the package exposes a native App Router media handler.

## Implemented feature: native App Router media handler

### Goal

Provide first-class App Router support through a handler usable from `app/api/openinary/media/route.ts`, without requiring a `pages/` directory for the media endpoint.

### Proposed API

Add a new [`createAppMediaHandler()`](../src/app-router-handler.ts:84) export rather than changing or removing [`createMediaHandler()`](../src/handlers.ts:105).

Consumer usage should look like:

```ts
// app/api/openinary/media/route.ts
import { createAppMediaHandler } from "next-tinacms-openinary/app-router";

const handler = createAppMediaHandler({
  openinaryUrl: process.env.OPENINARY_URL!,
  openinaryApiKey: process.env.OPENINARY_API_KEY!,
  authorized,
});

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
```

### Implementation requirements

- Accept Web [`Request`](../src/types.ts:1) objects.
- Return Web [`Response`](../src/types.ts:1) objects.
- Support `GET`, `POST`, and `DELETE` media operations.
- Parse multipart uploads through `request.formData()` or a compatible Web API parser.
- Preserve server-only API-key handling from [`OpeninaryServerOptions`](../src/types.ts:7).
- Preserve authorization callbacks, authorization timeout, media-root protection, path validation, upload limits, MIME-type validation, pagination, thumbnails, and public delivery URLs.
- Share Openinary operation and validation logic with [`createMediaHandler()`](../src/handlers.ts:105) to prevent behavior drift between router adapters.
- Export the handler through a dedicated subpath such as `next-tinacms-openinary/app-router`.
- Document supported runtime requirements, especially Node.js runtime and multipart parser compatibility.

### Compatibility

- Keep [`createMediaHandler()`](../src/handlers.ts:105) unchanged for existing Pages Router consumers.
- Keep current hybrid App Router support working during migration.
- Do not expose [`openinaryApiKey`](../src/types.ts:9) to browser code.

### Validation

- Add tests for Web [`Request`](../src/types.ts:1)/[`Response`](../src/types.ts:1) behavior.
- Test GET listing, POST upload, DELETE removal, authorization failures, malformed paths, upload limits, MIME restrictions, and Openinary API failures.
- Test parity between native App Router and existing Pages Router responses.
- Add an App Router consumer example or fixture.
- Update [`README.md`](../README.md) only after the handler is implemented and validated.

### Definition of done

- [x] App Router consumer can use `app/api/openinary/media/route.ts` without `pages/api/openinary/media.ts`.
- [x] Existing Pages Router integrations remain backward-compatible.
- [x] Server secrets remain server-only.
- [x] Public documentation describes native App Router support accurately.
- [x] Web Request/Response, authorization, listing, upload, delete, and unsupported-method behavior are covered by tests.
