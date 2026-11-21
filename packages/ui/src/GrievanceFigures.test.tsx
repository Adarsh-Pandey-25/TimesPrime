/**
 * @jest-environment node
 *
 * A month's grievance figures as tables (Panel 7 design §5, M3): every category, language, channel,
 * outcome and kind, with their counts; no median when nothing was decided.
 */

import { renderToStaticMarkup } from "react-dom/server";
import type { GrievanceFigures as Figures } from "@timesprime/shared/config/grievanceReports";
import GrievanceFigures from "./GrievanceFigures";

const FIGURES: Figures = {
  month: "2026-11",
  as_of: "2026-12-05T06:00:00Z",
  received: { total: 4, by_category: { factual_error: 3, defamation_privacy: 1, obscene_harmful: 0, copyright: 0, other: 0 }, by_language: { en: 3, hi: 1 }, by_channel: { web: 3, email: 1, post: 0, other: 0 } },
  decided: { total: 3, by_outcome: { upheld: 2, partly_upheld: 0, not_upheld: 1, outside_scope: 0, withdrawn: 0, duplicate: 0, spam: 0 }, within_15_days: 2, late: 1, median_days: 6.5 },
  open: { total: 1, late: 1 },
  corrections: { total: 2, by_kind: { correction: 1, clarification: 1, update: 0, editors_note: 0, retraction: 0 } },
};

const row = (label: string, value: string | number) => `<th scope="row" class="py-1 pr-3 text-left font-normal">${label}</th><td class="py-1 text-right font-semibold tabular-nums">${value}</td>`;

test("each table has its caption, and each row its label and count", () => {
  const html = renderToStaticMarkup(<GrievanceFigures figures={FIGURES} />);
  for (const caption of ["Grievances received", "By what they were about", "By language and how they arrived", "Decided", "Decisions", "Still open", "Corrections published"]) {
    expect(html).toContain(`>${caption}</caption>`);
  }
  expect(html).toContain(row("A factual error", 3));
  expect(html).toContain(row("Hindi", 1));
  expect(html).toContain(row("Email", 1));
  expect(html).toContain(row("Within 15 days", 2));
  expect(html).toContain(row("After 15 days", 1));
  expect(html).toContain(row("Median days to decide", 6.5));
  expect(html).toContain(row("Not upheld", 1));
  expect(html).toContain(row("Past their 15 days", 1));
  expect(html).toContain(row("Clarification", 1));
});

test("no decision yet: the median is a dash", () => {
  const html = renderToStaticMarkup(<GrievanceFigures figures={{ ...FIGURES, decided: { ...FIGURES.decided, total: 0, median_days: null } }} />);
  expect(html).toContain(row("Median days to decide", "—"));
});
