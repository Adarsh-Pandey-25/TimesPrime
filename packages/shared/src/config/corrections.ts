// The corrections log (Panel 7 design §2 and §4, decision 6): every public correction of a Desk story,
// with its kind, under its story and on /corrections. The database keeps the same kinds and limit
// (database/migrations/2026-11-21-compliance-2-corrections.sql); the text's limit is Panel 2's
// CORRECTION_NOTE_MAX.

/** Decision 6: what a correction is. */
export const CORRECTION_KINDS = ["correction", "clarification", "update", "editors_note", "retraction"] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

export const DEFAULT_CORRECTION_KIND: CorrectionKind = "correction";

export const CORRECTION_KIND_LABELS: Record<CorrectionKind, { en: string; hi: string }> = {
  correction: { en: "Correction", hi: "सुधार" },
  clarification: { en: "Clarification", hi: "स्पष्टीकरण" },
  update: { en: "Update", hi: "अपडेट" },
  editors_note: { en: "Editor's note", hi: "संपादक की टिप्पणी" },
  retraction: { en: "Retraction", hi: "खबर वापस ली गई" },
};

export function isCorrectionKind(value: unknown): value is CorrectionKind {
  return (CORRECTION_KINDS as readonly unknown[]).includes(value);
}

/** How many corrections /corrections shows to a page; the database gives at most 100 at once. */
export const CORRECTIONS_PAGE = 30;

/** A correction as readers see it: no staff, and the story only while it is live. */
export interface PublicCorrection {
  id: string;
  kind: CorrectionKind;
  text: string;
  language: "en" | "hi";
  published_at: string;
  story_live: boolean;
  headline: string | null;
  section: string | null;
  slug: string | null;
  public_id: number | null;
}
