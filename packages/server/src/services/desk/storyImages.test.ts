/**
 * @jest-environment node
 *
 * A story's images (Panel 2 design §7): the library's records as a page draws them, in the story's
 * language; readers get only a published revision's images that have renditions; the preview falls
 * back to the original through the back office; the checklist reads every image, in order.
 */

jest.mock("../../repositories/media", () => ({ getMediaByIds: jest.fn(), listPublishedImages: jest.fn() }));

import type { Rendition } from "@timesprime/shared/config/media";
import { checklistImages, imageView, previewImages, publishedImages } from "./storyImages";

const media = jest.requireMock("../../repositories/media") as { getMediaByIds: jest.Mock; listPublishedImages: jest.Mock };

const A = "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b";
const B = "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const r = (id: string, ratio: Rendition["ratio"], width: number, format: Rendition["format"]): Rendition => ({
  key: `renditions/${id}/${ratio}-${width}.${format}`, ratio, format, width, height: Math.round((width * (ratio === "16x9" ? 9 : ratio === "4x3" ? 3 : 1)) / (ratio === "16x9" ? 16 : ratio === "4x3" ? 4 : 1)), bytes: 1,
});
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, storage_key: `originals/${id}.jpg`, width: 2000, height: 1500, credit: "Photo: Asha Rao", active: true,
  alt_en: "Players", alt_hi: "खिलाड़ी", caption_en: "The final over.", caption_hi: "आखिरी ओवर",
  renditions: [r(id, "16x9", 480, "avif"), r(id, "16x9", 480, "webp"), r(id, "16x9", 1440, "avif"), r(id, "16x9", 1440, "webp"), r(id, "16x9", 960, "webp"), r(id, "16x9", 960, "avif")],
  ...over,
});
const body = (...ids: string[]) => ({ type: "doc", content: ids.map((id) => ({ type: "image", attrs: { id, ratio: "16x9" } })) });

beforeEach(() => jest.resetAllMocks());

test("an image as a page draws it: each crop's srcsets narrowest first, the WebP at 960 as its fallback", () => {
  const view = imageView(row(A), "en");
  expect(view).toEqual({
    alt: "Players",
    caption: "The final over.",
    credit: "Photo: Asha Rao",
    crops: {
      "16x9": {
        avif: `/media/renditions/${A}/16x9-480.avif 480w, /media/renditions/${A}/16x9-960.avif 960w, /media/renditions/${A}/16x9-1440.avif 1440w`,
        webp: `/media/renditions/${A}/16x9-480.webp 480w, /media/renditions/${A}/16x9-960.webp 960w, /media/renditions/${A}/16x9-1440.webp 1440w`,
        src: `/media/renditions/${A}/16x9-960.webp`,
        width: 960,
        height: 540,
      },
    },
  });
});

test("in Hindi: the Hindi alt text and caption", () => {
  expect(imageView(row(A), "hi")).toMatchObject({ alt: "खिलाड़ी", caption: "आखिरी ओवर" });
});

test("a rendition whose key is not the library's is ignored; a crop with one format only is not drawn", () => {
  const view = imageView(row(A, { renditions: [{ ...r(A, "16x9", 480, "avif"), key: "../../etc/passwd" }, r(A, "16x9", 480, "webp"), r(A, "4x3", 480, "webp")] }), "en");
  expect(view.crops).toEqual({});
});

test("readers: only the published revision's images, and only those with renditions", async () => {
  media.listPublishedImages.mockResolvedValue([row(A), row(B, { renditions: [] })]);
  const images = await publishedImages({ language: "en", revision: { id: "rev-1", body: body(A, B), headline: "h", dek: null, seo_title: null, seo_description: null } });
  expect(media.listPublishedImages).toHaveBeenCalledWith("rev-1", [A, B]);
  expect(Object.keys(images)).toEqual([A]);
  expect(images[A].fallbackUrl).toBeUndefined();
});

test("the preview: every image the library has, the original standing in until it has renditions", async () => {
  media.getMediaByIds.mockResolvedValue([row(A, { renditions: [] }), row(B)]);
  const images = await previewImages(body(A, B), "en", (id) => `/api/admin/desk/media/${id}/original`);
  expect(images[A]).toMatchObject({ crops: {}, fallbackUrl: `/api/admin/desk/media/${A}/original` });
  expect(images[B].fallbackUrl).toBeUndefined();
});

test("the checklist: each image the body uses, in its order, null for one the library lacks", async () => {
  media.getMediaByIds.mockResolvedValue([row(B)]);
  const images = await checklistImages(body(B, A, B));
  expect(media.getMediaByIds).toHaveBeenCalledWith([B, A]);
  expect(images).toEqual([expect.objectContaining({ id: B }), null]);
});
