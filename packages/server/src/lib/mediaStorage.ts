import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isMediaKey } from "@timesprime/shared/config/media";

/**
 * Where the Desk's images are kept (Panel 2 design §7: "behind one storage interface").
 *
 * - **S3**, when MEDIA_BUCKET is set (the server): the bucket in Mumbai (MEDIA_REGION, ap-south-1 by
 *   default), each file under `media/<key>`, so CloudFront's `/media/*` behaviour serves it at
 *   `https://<site>/media/<key>`. Credentials come from the server's role (the SDK's default chain).
 * - **A folder**, otherwise (a laptop): MEDIA_LOCAL_DIR, or `.media` at the repository's root (the
 *   apps and the worker run in their own folder, two below it). Each app serves it at `/media/<key>`.
 *
 * Every key is checked against the library's two shapes (an original, a rendition) before it
 * reaches S3 or a path, so nothing outside the library can be read or written.
 */

export interface MediaStorage {
  readonly kind: "s3" | "local";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The file's bytes, or null when there is none. */
  get(key: string): Promise<Uint8Array | null>;
}

/** Files never change once written (a new upload is a new key), so they are cached for a year. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function checked(key: string): string {
  if (!isMediaKey(key)) throw new Error(`Not a media key: ${key}`);
  return key;
}

function s3Storage(bucket: string, region: string): MediaStorage {
  const client = new S3Client({ region });
  return {
    kind: "s3",
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: `media/${checked(key)}`, Body: body, ContentType: contentType, CacheControl: CACHE_CONTROL }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `media/${checked(key)}` }));
        return out.Body ? await out.Body.transformToByteArray() : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
  };
}

function localStorage(root: string): MediaStorage {
  const fileOf = (key: string) => path.join(root, ...checked(key).split("/"));
  return {
    kind: "local",
    async put(key, body) {
      const file = fileOf(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(fileOf(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
  };
}

let cached: MediaStorage | null = null;

/** The storage this process uses, chosen once from its environment. */
export function mediaStorage(): MediaStorage {
  if (cached) return cached;
  const bucket = process.env.MEDIA_BUCKET?.trim();
  cached = bucket
    ? s3Storage(bucket, process.env.MEDIA_REGION?.trim() || "ap-south-1")
    : localStorage(process.env.MEDIA_LOCAL_DIR?.trim() || path.resolve(process.cwd(), "..", "..", ".media"));
  return cached;
}

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

/**
 * A file from the local folder, for each app's `/media/[...key]` route on a laptop. With S3 the
 * server never reaches the app for `/media/*` (CloudFront serves it from the bucket), so the route
 * answers 404 there, as it does for anything that is not a library key.
 */
export async function localMediaResponse(segments: readonly string[]): Promise<Response> {
  const key = segments.join("/");
  const storage = mediaStorage();
  const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  if (storage.kind !== "local" || !isMediaKey(key)) return notFound();
  const body = await storage.get(key);
  if (!body) return notFound();
  return new Response(body as BodyInit, {
    headers: {
      "content-type": CONTENT_TYPES[key.slice(key.lastIndexOf(".") + 1)] ?? "application/octet-stream",
      "cache-control": CACHE_CONTROL,
      "x-content-type-options": "nosniff",
    },
  });
}

/** For tests: forget the chosen storage, so the next call reads the environment again. */
export function resetMediaStorage(): void {
  cached = null;
}

/**
 * The address a page shows a file at: MEDIA_PUBLIC_BASE (the server: `https://<site>/media`, so the
 * back office, on its own host, reaches CloudFront too), or `/media`, which each app serves from the
 * local folder on a laptop.
 */
export function mediaUrl(key: string): string {
  const base = (process.env.MEDIA_PUBLIC_BASE?.trim() || "/media").replace(/\/+$/, "");
  return `${base}/${checked(key)}`;
}
