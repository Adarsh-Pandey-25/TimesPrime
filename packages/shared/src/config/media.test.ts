/**
 * @jest-environment node
 *
 * The media library's rules (Panel 2 design §7): an image's type is read from its first bytes, and
 * only the library's two key shapes are ever a storage key.
 */

import { isMediaKey, sniffMediaType } from "./media";

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
