// The monthly grievance report (Panel 7 design §5, decision 7; Rule 18(3) of the IT Rules): a month's
// figures, computed by the database (grievance_month_figures, database/migrations/
// 2026-11-21-compliance-3-reports.sql), checked and published by the Grievance Officer or Legal by
// the 7th of the next month, at /grievance-report. Published figures never change.

import type { CorrectionKind } from "./corrections";
import type { GrievanceCategory, GrievanceChannel, GrievanceOutcome } from "./grievances";

/** Decision 7: a month's report is due by this day of the next month (the lawyer to confirm). */
export const REPORT_DUE_DAY = 7;
/** The longest note a report may carry, as the table's CHECK has it. */
export const REPORT_NOTE_MAX = 1000;

/** A month's figures, as the database computes them: counts only. */
export interface GrievanceFigures {
  month: string;
  as_of: string;
  received: {
    total: number;
    by_category: Record<GrievanceCategory, number>;
    by_language: Record<"en" | "hi", number>;
    by_channel: Record<GrievanceChannel, number>;
  };
  decided: {
    total: number;
    by_outcome: Record<GrievanceOutcome, number>;
    within_15_days: number;
    late: number;
    median_days: number | null;
  };
  open: { total: number; late: number };
  corrections: { total: number; by_kind: Record<CorrectionKind, number> };
}

/** A month as the routes and pages name it: 2026-11. */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

/** The month a time falls in, in India: "2026-11". */
export function monthOf(at: Date): string {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before a month: "2026-01" → "2025-12". */
export function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

/** The month's first day, as the table stores it: "2026-11" → "2026-11-01". */
export const monthStart = (month: string) => `${month}-01`;

/** Whether a month has ended, in India, at a time: only an ended month is published. */
export function monthEnded(month: string, now: Date): boolean {
  return month < monthOf(now);
}

/** When a month's report is due: the REPORT_DUE_DAY of the next month, at the end of that day in India. */
export function reportDueAt(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  // 23:59:59 IST on the due day is 18:29:59 UTC.
  return new Date(Date.UTC(nextYear, nextMonth - 1, REPORT_DUE_DAY, 18, 29, 59));
}

/** "November 2026" or "नवंबर 2026". */
export function monthLabel(month: string, language: "en" | "hi" = "en"): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 15)).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** The last `count` months that have ended, newest first: what a report can be published for. */
export function endedMonths(now: Date, count: number): string[] {
  const months: string[] = [];
  let month = previousMonth(monthOf(now));
  for (let i = 0; i < count; i += 1) {
    months.push(month);
    month = previousMonth(month);
  }
  return months;
}
