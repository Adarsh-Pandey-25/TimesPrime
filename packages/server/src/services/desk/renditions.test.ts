/**
 * @jest-environment node
 *
 * The renditions (Panel 2 design §7), made with the real sharp from pictures made here: every crop
 * and width in AVIF and WebP, never enlarged, turned upright, without the camera's metadata; an
 * unusable file is recorded as failed once; a storage or database failure leaves the image waiting.
 */

jest.mock("../../repositories/media", () => ({ listPendingRenditions: jest.fn(), recordRenditions: jest.fn(async () => true) }));

import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { RENDITION_KEY } from "@timesprime/shared/config/media";
import { mediaStorage, resetMediaStorage } from "../../lib/mediaStorage";
import { makePendingRenditions, renderRenditions, UnusableImageError } from "./renditions";

const { listPendingRenditions, recordRenditions } = jest.requireMock("../../repositories/media") as {
  listPendingRenditions: jest.Mock;
  recordRenditions: jest.Mock;
};

const GOOD = "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b";
const BAD = "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const env = { ...process.env };
let dir: string;

/** A picture made here: a JPEG with the camera's metadata (a copyright and an artist in its EXIF). */
const photo = (width: number, height: number, orientation?: number) => {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  image = orientation ? image.withMetadata({ orientation }) : image.withExif({ IFD0: { Copyright: "Asha Rao", Artist: "Asha Rao" } });
  return image.toBuffer().then((b) => new Uint8Array(b));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetMediaStorage();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "renditions-"));
  process.env = { ...env, MEDIA_LOCAL_DIR: dir };
  delete process.env.MEDIA_BUCKET;
});

afterAll(() => {
  process.env = env;
});

test("every crop at its widths, in AVIF and WebP, each exactly its size, with no EXIF", async () => {
  const original = await photo(2000, 1500);
  expect((await sharp(original).metadata()).exif).toBeDefined();
  const { width, height, files } = await renderRenditions(GOOD, original);
  expect([width, height]).toEqual([2000, 1500]);
  expect(files.map((f) => f.rendition.key.split("/")[2]).sort()).toEqual(
    ["16x9-480", "16x9-960", "16x9-1440", "4x3-480", "4x3-960", "1x1-240", "1x1-480"].flatMap((n) => [`${n}.avif`, `${n}.webp`]).sort()
  );
  for (const { rendition, body } of files) {
    expect(RENDITION_KEY.test(rendition.key)).toBe(true);
    const meta = await sharp(body).metadata();
    expect([meta.width, meta.height]).toEqual([rendition.width, rendition.height]);
    expect(meta.format).toBe(rendition.format === "avif" ? "heif" : "webp");
    expect(meta.exif).toBeUndefined();
    expect(rendition.bytes).toBe(body.length);
  }
}, 60_000);

test("a picture turned by its EXIF is made upright, and a small one is never enlarged", async () => {
  // Stored 400 x 300, shown 300 x 400 (orientation 6: a quarter turn).
  const { width, height, files } = await renderRenditions(GOOD, await photo(400, 300, 6));
  expect([width, height]).toEqual([300, 400]);
  const sizes = Object.fromEntries(files.filter((f) => f.rendition.format === "webp").map((f) => [f.rendition.ratio, [f.rendition.width, f.rendition.height]]));
  expect(sizes).toEqual({ "16x9": [300, 169], "4x3": [300, 225], "1x1": [240, 240] });
}, 30_000);

test("a file sharp cannot read, or a picture too small to crop, is unusable", async () => {
  await expect(renderRenditions(GOOD, new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]))).rejects.toBeInstanceOf(UnusableImageError);
  await expect(renderRenditions(GOOD, await photo(20, 20))).rejects.toThrow("too small");
});

describe("a run of the worker's job", () => {
  const keep = async (id: string, bytes: Uint8Array) => {
    await mediaStorage().put(`originals/${id}.jpg`, bytes, "image/jpeg");
    return { id, storage_key: `originals/${id}.jpg` };
  };

  test("makes and records each waiting image's renditions; an unusable one is recorded with none, once", async () => {
    listPendingRenditions.mockResolvedValue([await keep(GOOD, await photo(1200, 900)), await keep(BAD, new Uint8Array([0xff, 0xd8, 0xff, 9]))]);
    const run = await makePendingRenditions();
    expect(run).toEqual({ made: [GOOD], unusable: [{ id: BAD, error: expect.stringContaining("sharp could not convert it") }], failed: [], more: false });
    expect(listPendingRenditions).toHaveBeenCalledWith(21);
    const [goodCall, badCall] = recordRenditions.mock.calls;
    expect(goodCall[0]).toBe(GOOD);
    expect(goodCall[1]).toMatchObject({ width: 1200, height: 900 });
    // 1200 wide: the 16:9 crop stops at 960 (no 1440), so 6 sizes in two formats.
    expect(goodCall[1].renditions).toHaveLength(12);
    for (const r of goodCall[1].renditions) expect(fs.existsSync(path.join(dir, ...r.key.split("/")))).toBe(true);
    expect(badCall).toEqual([BAD, { renditions: [] }]);
  }, 60_000);

  test("a missing original is unusable too", async () => {
    listPendingRenditions.mockResolvedValue([{ id: GOOD, storage_key: `originals/${GOOD}.jpg` }]);
    const run = await makePendingRenditions();
    expect(run.unusable).toEqual([{ id: GOOD, error: "the original file is missing" }]);
    expect(recordRenditions).toHaveBeenCalledWith(GOOD, { renditions: [] });
  });

  test("a storage failure leaves the image waiting: nothing recorded, tried again next run", async () => {
    listPendingRenditions.mockResolvedValue([await keep(GOOD, await photo(600, 400))]);
    jest.spyOn(mediaStorage(), "put").mockRejectedValue(new Error("S3 is unreachable"));
    const run = await makePendingRenditions();
    expect(run.failed).toEqual([{ id: GOOD, error: "S3 is unreachable" }]);
    expect(run.made).toEqual([]);
    expect(recordRenditions).not.toHaveBeenCalled();
  }, 30_000);

  test("a run takes a batch, starts no image after its time is up, and says more are waiting", async () => {
    listPendingRenditions.mockResolvedValue([{ id: GOOD, storage_key: `originals/${GOOD}.jpg` }, { id: BAD, storage_key: `originals/${BAD}.jpg` }]);
    const late = await makePendingRenditions({ batch: 5, budgetMs: 1000, clock: jest.fn().mockReturnValueOnce(0).mockReturnValue(1000) });
    expect(late).toEqual({ made: [], unusable: [], failed: [], more: true });
    expect(recordRenditions).not.toHaveBeenCalled();
    expect((await makePendingRenditions({ batch: 1 })).more).toBe(true);
    expect(listPendingRenditions).toHaveBeenLastCalledWith(2);
  });
});
