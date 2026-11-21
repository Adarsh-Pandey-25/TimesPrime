import "server-only";

import { monthStart, type GrievanceFigures } from "@timesprime/shared/config/grievanceReports";
import { supabase } from "../lib/supabase";
import { GrievanceStoreError } from "./grievances";

/**
 * The monthly grievance report (Panel 7 design §2 and §5, M3). The figures are computed by the
 * database (grievance_month_figures); publishing is grievance_report_publish, one transaction that
 * computes them again and stores the month's next version (database/migrations/
 * 2026-11-21-compliance-3-reports.sql). Readers read the reports through their own policy.
 */

export interface ReportRow {
  id: string;
  /** The month's first day, as stored: 2026-11-01. */
  month: string;
  version: number;
  figures: GrievanceFigures;
  note: string | null;
  published_by: string;
  published_at: string;
}

export type PublicReport = Omit<ReportRow, "published_by">;

const COLUMNS = "id, month, version, figures, note, published_by, published_at";
const PUBLIC_COLUMNS = "id, month, version, figures, note, published_at";

/** Codes for "not there yet": compliance-3 not applied (no function, no table). */
const NOT_APPLIED = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

/** The database's refusals: 409 for a month that has not ended; 422 for a value it refuses. */
export function reportError(error: { code?: string; message: string }): GrievanceStoreError {
  switch (error.code) {
    case "55000": // object_not_in_prerequisite_state
      return new GrievanceStoreError(409, "A month's report is published once the month has ended.");
    case "23505": // unique_violation: two publications of a month at once
      return new GrievanceStoreError(409, "This month was published at the same moment. Look again.");
    case "23514":
    case "22P02":
    case "22007": // invalid_datetime_format
    case "22008":
      return new GrievanceStoreError(422, error.message);
    default:
      return new GrievanceStoreError(500, error.message);
  }
}

/** A month's figures, computed now (the draft the officer checks). null before compliance-3. */
export async function monthFigures(month: string): Promise<GrievanceFigures | null> {
  const { data, error } = await supabase.rpc("grievance_month_figures", { p_month: monthStart(month) });
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return null;
    throw reportError(error);
  }
  return (data as GrievanceFigures | null) ?? null;
}

/** Publishes a month's report as its next version (grievance_report_publish). */
export async function publishReport(month: string, actorId: string, note: string | null): Promise<ReportRow> {
  const { data, error } = await supabase.rpc("grievance_report_publish", { p_month: monthStart(month), p_actor: actorId, p_note: note });
  if (error) throw reportError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new GrievanceStoreError(500, "grievance_report_publish returned nothing.");
  return row as ReportRow;
}

/** A month's published versions, the newest first (the back office: with who published). */
export async function monthReports(month: string): Promise<ReportRow[] | null> {
  const { data, error } = await supabase.from("grievance_reports").select(COLUMNS).eq("month", monthStart(month)).order("version", { ascending: false });
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return null;
    throw reportError(error);
  }
  return (data ?? []) as ReportRow[];
}

/**
 * The published reports readers see, without who published them: every month's every version,
 * newest month first, then newest version first; or one month's. Empty before compliance-3.
 */
export async function publicReports(month: string | null = null): Promise<PublicReport[]> {
  let query = supabase.from("grievance_reports").select(PUBLIC_COLUMNS);
  if (month) query = query.eq("month", monthStart(month));
  const { data, error } = await query.order("month", { ascending: false }).order("version", { ascending: false }).limit(500);
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return [];
    throw reportError(error);
  }
  return (data ?? []) as PublicReport[];
}
