/**
 * @jest-environment node
 *
 * A story's images (Panel 2 design §7): which library images a body uses, whether its image nodes
 * are well formed, and the pre-publish checklist's image rules.
 */

import { checklist, imageChecklist, type ChecklistImage } from "./desk";
import { storyImageIds, storyImagesWellFormed } from "./media";

const A = "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b";
const B = "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const image = (id: unknown, ratio: unknown = "16x9") => ({ type: "image", attrs: { id, ratio } });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("the images a body uses", () => {
  test("in order, each once, at any depth; nodes without a library id skipped", () => {
    const body = doc(image(B), { type: "paragraph", content: [{ type: "text", text: "x" }] }, image(A), { type: "factbox", content: [image(B)] }, image("../x"), image(null));
    expect(storyImageIds(body)).toEqual([B, A]);
    expect(storyImageIds(null)).toEqual([]);
    expect(storyImageIds(doc())).toEqual([]);
  });

  test("a body is well formed when every image names a library id and a known crop", () => {
    expect(storyImagesWellFormed(doc(image(A), image(B, "1x1"), { type: "image", attrs: { id: A } }))).toBe(true);
    expect(storyImagesWellFormed(doc(image("not-an-id")))).toBe(false);
    expect(storyImagesWellFormed(doc(image(A, "21x9")))).toBe(false);
    expect(storyImagesWellFormed(doc({ type: "image" }))).toBe(false);
  });
});

describe("the checklist's image rules", () => {
  const NOW = new Date("2026-11-18T10:00:00Z");
  const ready: ChecklistImage = {
    active: true, credit: "Photo: Asha Rao", source: "staff", licence: "Own work", licence_expires_at: "2027-01-01T00:00:00Z",
    rights_cleared_at: "2026-11-18T09:00:00Z", alt_en: "Players", alt_hi: null, caption_en: "The final over.", caption_hi: null,
  };
  const base = { headline: "Budget passes", dek: "The house voted.", seoTitle: "Budget passes", slug: "budget-passes", legalReviewRequired: false, counterpartMissing: false };

  test("a story with ready images passes; with none, the images add nothing", () => {
    expect(checklist({ ...base, images: [ready], language: "en", now: NOW })).toEqual([]);
    expect(checklist(base)).toEqual([]);
  });

  test.each([
    ["missing from the library", null, ["image_unavailable"]],
    ["retired", { ...ready, active: false }, ["image_unavailable"]],
    ["its licence ended", { ...ready, licence_expires_at: "2026-11-18T09:59:59Z" }, ["image_unavailable"]],
    ["no credit", { ...ready, credit: null }, ["image_rights_missing"]],
    ["no source", { ...ready, source: null }, ["image_rights_missing"]],
    ["no licence", { ...ready, licence: null }, ["image_rights_missing"]],
    ["rights not cleared", { ...ready, rights_cleared_at: null }, ["image_rights_missing"]],
    ["no alt text", { ...ready, alt_en: null }, ["image_text_missing"]],
    ["no caption", { ...ready, caption_en: null }, ["image_text_missing"]],
  ])("an image %s is refused", (_name, img, problems) => {
    expect(imageChecklist([ready, img as ChecklistImage | null], "en", NOW)).toEqual(problems);
  });

  test("the alt text and caption are those of the story's language", () => {
    expect(imageChecklist([ready], "hi", NOW)).toEqual(["image_text_missing"]);
    expect(imageChecklist([{ ...ready, alt_hi: "खिलाड़ी", caption_hi: "आखिरी ओवर" }], "hi", NOW)).toEqual([]);
  });

  test("a licence with no end date never ends", () => {
    expect(imageChecklist([{ ...ready, licence_expires_at: null }], "en", NOW)).toEqual([]);
  });
});
