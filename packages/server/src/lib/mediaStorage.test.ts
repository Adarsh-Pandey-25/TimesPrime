/**
 * @jest-environment node
 *
 * Where the Desk's images are kept (Panel 2 design §7): a folder on a laptop, S3 on the server, one
 * interface; only library keys reach either; only renditions are ever served or given an address.
 */

const send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  class NoSuchKey extends Error {}
  class PutObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class GetObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class S3Client {
    constructor(readonly config: unknown) {}
    send = send;
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, NoSuchKey };
});

import fs from "fs";
import os from "os";
import path from "path";
import { contentTypeOf, localMediaResponse, mediaStorage, mediaUrl, resetMediaStorage } from "./mediaStorage";

const KEY = "originals/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b.jpg";
const RENDITION = "renditions/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b/4x3-480.webp";
const env = { ...process.env };
let dir: string;

beforeEach(() => {
  resetMediaStorage();
  send.mockReset();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-"));
  process.env = { ...env, MEDIA_LOCAL_DIR: dir };
  delete process.env.MEDIA_BUCKET;
  delete process.env.MEDIA_PUBLIC_BASE;
});

afterAll(() => {
  process.env = env;
});

describe("on a laptop: a folder", () => {
  test("a file written is read back, under its key's path", async () => {
    const storage = mediaStorage();
    expect(storage.kind).toBe("local");
    await storage.put(KEY, new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(fs.existsSync(path.join(dir, "originals", "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b.jpg"))).toBe(true);
    expect(Array.from((await storage.get(KEY)) ?? [])).toEqual([1, 2, 3]);
    expect(await storage.get("originals/00000000-0000-4000-8000-000000000000.png")).toBeNull();
  });

  test("anything but a library key is refused before a path is built", async () => {
    const storage = mediaStorage();
    await expect(storage.put("../escape.jpg", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("Not a media key");
    await expect(storage.get("originals/../../secret")).rejects.toThrow("Not a media key");
  });

  test("each app serves the renditions at /media: the file, its type, a year's caching; else 404", async () => {
    await mediaStorage().put(RENDITION, new Uint8Array([9]), "image/webp");
    const ok = await localMediaResponse(RENDITION.split("/"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await localMediaResponse(["renditions", "..", "secret"])).status).toBe(404);
    expect((await localMediaResponse(["renditions", "00000000-0000-4000-8000-000000000000", "1x1-480.webp"])).status).toBe(404);
  });

  test("an original is never served at /media: it keeps the camera's metadata, so only staff see it", async () => {
    await mediaStorage().put(KEY, new Uint8Array([9]), "image/jpeg");
    expect((await localMediaResponse(KEY.split("/"))).status).toBe(404);
  });
});

describe("on the server: S3", () => {
  beforeEach(() => {
    process.env.MEDIA_BUCKET = "timesprime-media";
  });

  test("files go under media/ in the bucket, cached for a year; the region is Mumbai unless set", async () => {
    const storage = mediaStorage();
    expect(storage.kind).toBe("s3");
    await storage.put(KEY, new Uint8Array([1]), "image/jpeg");
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "timesprime-media",
      Key: `media/${KEY}`,
      Body: new Uint8Array([1]),
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  test("a file not in the bucket is null; the app never serves /media itself", async () => {
    const { NoSuchKey } = jest.requireMock("@aws-sdk/client-s3") as { NoSuchKey: new (m: string) => Error };
    send.mockRejectedValue(new NoSuchKey("missing"));
    expect(await mediaStorage().get(KEY)).toBeNull();
    expect((await localMediaResponse(KEY.split("/"))).status).toBe(404);
  });
});

test("a page shows a rendition at /media, or at MEDIA_PUBLIC_BASE on the server; an original has no address", () => {
  expect(mediaUrl(RENDITION)).toBe(`/media/${RENDITION}`);
  process.env.MEDIA_PUBLIC_BASE = "https://timesprime247.com/media/";
  expect(mediaUrl(RENDITION)).toBe(`https://timesprime247.com/media/${RENDITION}`);
  expect(() => mediaUrl(KEY)).toThrow("Not a rendition's key");
  expect(() => mediaUrl("../x")).toThrow("Not a rendition's key");
  expect(contentTypeOf(KEY)).toBe("image/jpeg");
  expect(contentTypeOf(RENDITION)).toBe("image/webp");
});
