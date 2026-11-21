/**
 * @jest-environment node
 *
 * The corrections log's kinds (Panel 7, decision 6): a label in English and Hindi for each, and the
 * same kinds and limit as the database's.
 */

import fs from "fs";
import path from "path";
import { CORRECTION_KIND_LABELS, CORRECTION_KINDS, isCorrectionKind } from "./corrections";
import { CORRECTION_NOTE_MAX } from "./desk";

test("every kind has an English and a Hindi label", () => {
  for (const k of CORRECTION_KINDS) expect(CORRECTION_KIND_LABELS[k]).toEqual({ en: expect.any(String), hi: expect.any(String) });
  expect(isCorrectionKind("retraction")).toBe(true);
  expect(isCorrectionKind("apology")).toBe(false);
});

test("the kinds and the text's limit agree with compliance-2", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-21-compliance-2-corrections.sql"), "utf8");
  expect(sql).toContain(`kind IN (${CORRECTION_KINDS.map((k) => `'${k}'`).join(", ")})`);
  expect(sql).toContain(`char_length(text) <= ${CORRECTION_NOTE_MAX}`);
});
