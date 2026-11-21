/**
 * @jest-environment node
 *
 * The monthly report's months (Panel 7 design §5): a month in India, the one before, whether it has
 * ended, when its report is due (the 7th of the next month), and the months that can be published.
 */

import fs from "fs";
import path from "path";
import { endedMonths, isMonth, monthEnded, monthLabel, monthOf, monthStart, previousMonth, REPORT_NOTE_MAX, reportDueAt } from "./grievanceReports";

test("a month is YYYY-MM", () => {
  expect(isMonth("2026-11")).toBe(true);
  for (const bad of ["2026-13", "2026-1", "26-11", "2026-11-01", 202611, null]) expect(isMonth(bad)).toBe(false);
  expect(monthStart("2026-11")).toBe("2026-11-01");
});

test("the month of a time is India's: 18:29 UTC on the last day is still that month, 18:30 the next", () => {
  expect(monthOf(new Date("2026-11-30T18:29:00Z"))).toBe("2026-11");
  expect(monthOf(new Date("2026-11-30T18:30:00Z"))).toBe("2026-12");
  expect(monthOf(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01");
});

test("the month before, across a year", () => {
  expect(previousMonth("2026-11")).toBe("2026-10");
  expect(previousMonth("2027-01")).toBe("2026-12");
});

test("only a month that has ended is published", () => {
  const now = new Date("2026-12-03T10:00:00Z");
  expect(monthEnded("2026-11", now)).toBe(true);
  expect(monthEnded("2026-12", now)).toBe(false);
  expect(monthEnded("2027-01", now)).toBe(false);
});

test("decision 7: due by the end of the 7th of the next month, in India; December's in January", () => {
  expect(reportDueAt("2026-11").toISOString()).toBe("2026-12-07T18:29:59.000Z");
  expect(reportDueAt("2026-12").toISOString()).toBe("2027-01-07T18:29:59.000Z");
});

test("the months that can be published: the ended ones, newest first", () => {
  expect(endedMonths(new Date("2027-02-10T00:00:00Z"), 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
});

test("a month's name in English and Hindi", () => {
  expect(monthLabel("2026-11")).toBe("November 2026");
  expect(monthLabel("2026-11", "hi")).toContain("2026");
});

test("the note's limit agrees with compliance-3", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-21-compliance-3-reports.sql"), "utf8");
  expect(sql).toContain(`char_length(note) <= ${REPORT_NOTE_MAX}`);
});
