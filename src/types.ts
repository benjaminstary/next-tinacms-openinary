import type { NextApiRequest, NextApiResponse } from "next";

export interface OpeninaryOptions {
  proxyUrl?: string;
  fetch?: typeof fetch;
}
export interface OpeninaryServerOptions {
  openinaryUrl: string;
  openinaryApiKey: string;
  authorize?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<boolean | void> | boolean | void;
  authorized?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<boolean | void> | boolean | void;
  mediaRoot?: string;
  publicDeliveryUrl?: string;
  acceptedMimeTypes?: string[];
  maxUploadFileSize?: number;
  maxUploadTotalSize?: number;
  maxUploadFields?: number;
  maxUploadFiles?: number;
  authorizationTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxRequestRetries?: number;
  thumbnailTransformations?: Partial<
    Record<"75x75" | "400x400" | "1000x1000", string>
  >;
  fetch?: typeof fetch;
}
export interface OpeninaryEntry {
  path: string;
  url?: string;
  name?: string;
  type?: string;
  mimeType?: string;
}
export interface OpeninaryListing {
  folders?: Array<string | OpeninaryEntry>;
  files?: Array<string | OpeninaryEntry>;
}
export interface OpeninaryUploadResult {
  path?: string;
  url?: string;
  name?: string;
  success?: boolean;
  error?: string;
}
export interface TinaMedia {
  id: string;
  type: "file" | "dir";
  filename: string;
  directory: string;
  src: string;
  thumbnails: Record<string, string>;
}
export interface MediaUploadOptions {
  directory: string;
  file: File;
}
export interface ListOptions {
  directory?: string;
  limit?: number;
  offset?: string | number;
  filesOnly?: boolean;
}
