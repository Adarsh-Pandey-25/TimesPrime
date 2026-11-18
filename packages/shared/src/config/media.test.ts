/**
 * @jest-environment node
 *
 * The media library's rules (Panel 2 design §7): an image's type is read from its first bytes, and
 * only the library's two key shapes are ever a storage key.
 */

import {
  isMediaKey,
  previewRendition,
  RENDITION_FORMATS,
  RENDITION_KEY,
  RENDITION_RATIOS,
  renditionHeight,
  renditionKey,
  renditionsState,
  renditionWidths,
  sniffMediaType,
  type Rendition,
  type RenditionRatio,
} from "./media";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

test.each([
  ["a JPEG", bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
  ["a PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
  ["a WebP", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")), "image/webp"],
  ["an AVIF", bytes(0, 0, 0, 0x1c, ...ascii("ftypavif")), "image/avif"],
  ["a GIF", bytes(...ascii("GIF89a")), null],
  ["an SVG", bytes(...ascii("<svg xmlns")), null],
  ["a PDF", bytes(...ascii("%PDF-1.7")), null],
  ["a WAV in a RIFF", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")), null],
  ["nothing", new Uint8Array(0), null],
])("%s is %s", (_name, head, type) => {
  expect(sniffMediaType(head)).toBe(type);
});

test.each([
  ["originals/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b.jpg", true],
  ["renditions/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b/16x9-1600.avif", true],
  ["renditions/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b/1x1-480.webp", true],
  ["originals/../../.env", false],
  ["originals/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b.svg", false],
  ["/etc/passwd", false],
  ["originals/3F9A0C21-B7D4-4E0E-9A6B-5C4D3E2F1A0B.jpg", false],
  ["renditions/3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b/2x1-1600.webp", false],
])("%j is a library key: %s", (key, ok) => {
  expect(isMediaKey(key)).toBe(ok);
});

describe("the renditions (design §7)", () => {
  const ID = "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b";

  test("each crop's widths: the listed ones the picture can fill, never wider than the picture", () => {
    expect(renditionWidths("16x9", 4000, 3000)).toEqual([480, 960, 1440]);
    expect(renditionWidths("4x3", 4000, 3000)).toEqual([480, 960]);
    expect(renditionWidths("1x1", 4000, 3000)).toEqual([240, 480]);
    // A 1000 x 600 picture: its widest 16:9 crop is 1000, its widest 4:3 800, its widest square 600.
    expect(renditionWidths("16x9", 1000, 600)).toEqual([480, 960]);
    expect(renditionWidths("4x3", 1000, 600)).toEqual([480]);
    expect(renditionWidths("1x1", 1000, 600)).toEqual([240, 480]);
  });

  test("a small picture gets one rendition at its own crop's width; a tiny one gets none", () => {
    expect(renditionWidths("16x9", 300, 200)).toEqual([300]);
    expect(renditionWidths("4x3", 300, 200)).toEqual([266]);
    expect(renditionWidths("1x1", 300, 200)).toEqual([200]);
    expect(renditionWidths("1x1", 40, 31)).toEqual([]);
  });

  test("a crop's height never exceeds the picture's, and every key is a library key", () => {
    for (const ratio of Object.keys(RENDITION_RATIOS) as RenditionRatio[]) {
      for (const [w, h] of [[4000, 3000], [1000, 600], [300, 200], [601, 1999]]) {
        for (const width of renditionWidths(ratio, w, h)) {
          expect(width).toBeLessThanOrEqual(w);
          expect(renditionHeight(ratio, width)).toBeLessThanOrEqual(h);
          for (const format of RENDITION_FORMATS) expect(isMediaKey(renditionKey(ID, ratio, width, format))).toBe(true);
        }
      }
    }
    expect(RENDITION_KEY.test(renditionKey(ID, "16x9", 1440, "avif"))).toBe(true);
    expect(renditionHeight("16x9", 1440)).toBe(810);
  });

  test("an image's renditions are waiting until the worker has run, then made, or failed with none", () => {
    expect(renditionsState({ renditions_at: null, renditions: [] })).toBe("waiting");
    expect(renditionsState({ renditions_at: "2026-11-18T10:00:00Z", renditions: [{}] })).toBe("ready");
    expect(renditionsState({ renditions_at: "2026-11-18T10:00:00Z", renditions: [] })).toBe("failed");
  });

  test("the library's tile shows the 4:3 WebP at 480, else the nearest 4:3 WebP", () => {
    const r = (ratio: RenditionRatio, width: number, format: "avif" | "webp"): Rendition => ({
      key: renditionKey(ID, ratio, width, format), ratio, format, width, height: renditionHeight(ratio, width), bytes: 1,
    });
    expect(previewRendition([r("16x9", 480, "webp"), r("4x3", 960, "webp"), r("4x3", 480, "avif"), r("4x3", 480, "webp")])?.key).toBe(renditionKey(ID, "4x3", 480, "webp"));
    expect(previewRendition([r("4x3", 266, "webp"), r("4x3", 266, "avif")])?.width).toBe(266);
    expect(previewRendition([])).toBeNull();
  });
});
