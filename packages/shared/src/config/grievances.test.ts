/**
 * @jest-environment node
 *
 * Grievances (Panel 7 design §2 to §4): the fields the form and the officer send, the clocks, the
 * masked email, and that the limits agree with the database's.
 */

import fs from "fs";
import path from "path";
import {
  FORM_DAILY_CAP,
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_LIMITS,
  GRIEVANCE_OUTCOME_LABELS,
  GRIEVANCE_OUTCOMES,
  grievanceClock,
  grievanceFields,
  isEmail,
  maskEmail,
  normaliseTicket,
  TICKET_PATTERN,
} from "./grievances";

const VALID = { language: "hi", name: " Asha Rao ", email: " asha@example.com ", about_url: " /india/a-story-12 ", category: "factual_error", body: " The score was wrong. " };

describe("a grievance's fields", () => {
  test("trimmed, with an empty address as none", () => {
    expect(grievanceFields(VALID)).toEqual({
      ok: true,
      fields: { language: "hi", name: "Asha Rao", email: "asha@example.com", aboutUrl: "/india/a-story-12", category: "factual_error", body: "The score was wrong." },
    });
    const none = grievanceFields({ ...VALID, about_url: "  " });
    expect(none.ok && none.fields.aboutUrl).toBeNull();
    const absent = grievanceFields({ ...VALID, about_url: undefined });
    expect(absent.ok && absent.fields.aboutUrl).toBeNull();
  });

  test.each([
    ["a language other than en or hi", { language: "fr" }, /language/],
    ["no name", { name: "  " }, /name/],
    ["a name too long", { name: "x".repeat(GRIEVANCE_LIMITS.name + 1) }, /name/],
    ["no email", { email: "" }, /email/],
    ["an email without a domain", { email: "asha@" }, /email/],
    ["an address that is not text", { about_url: 7 }, /about_url/],
    ["an address too long", { about_url: "x".repeat(GRIEVANCE_LIMITS.aboutUrl + 1) }, /address/],
    ["an unknown category", { category: "rude" }, /category/],
    ["no grievance", { body: " " }, /grievance/],
    ["a grievance too long", { body: "x".repeat(GRIEVANCE_LIMITS.body + 1) }, /grievance/],
  ])("refuses %s", (_name, change, words) => {
    const result = grievanceFields({ ...VALID, ...change });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(words);
  });

  test("an email of the right shape, at most 254 characters", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a b@c.co")).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
    expect(isEmail(null)).toBe(false);
  });

  test("every category and outcome has an English and a Hindi label", () => {
    for (const c of GRIEVANCE_CATEGORIES) expect(GRIEVANCE_CATEGORY_LABELS[c]).toEqual({ en: expect.any(String), hi: expect.any(String) });
    for (const o of GRIEVANCE_OUTCOMES) expect(GRIEVANCE_OUTCOME_LABELS[o]).toEqual({ en: expect.any(String), hi: expect.any(String) });
  });
});

describe("tickets and the masked email", () => {
  test("a ticket is G-<year>-<number>; a typed one is trimmed and upper-cased", () => {
    expect(TICKET_PATTERN.test("G-2026-00042")).toBe(true);
    expect(TICKET_PATTERN.test("G-2026-123456")).toBe(true);
    expect(TICKET_PATTERN.test("G-26-00042")).toBe(false);
    expect(normaliseTicket(" g-2026-00042 ")).toBe("G-2026-00042");
  });

  test("decision 4: the Managing Editor sees the first letter and the domain", () => {
    expect(maskEmail("asha@example.com")).toBe("a•••@example.com");
    expect(maskEmail("not-an-email")).toBe("•••");
  });
});

describe("the clocks", () => {
  const AT = Date.parse("2026-11-20T10:00:00Z");
  const H = 3_600_000;
  const open = (over: Partial<Parameters<typeof grievanceClock>[0]> = {}) => ({
    state: "open" as const,
    acknowledged_at: "2026-11-20T10:00:00Z",
    ack_due_at: "2026-11-21T10:00:00Z",
    decide_due_at: "2026-12-05T10:00:00Z",
    decided_at: null,
    ...over,
  });

  test("an acknowledged grievance counts down to its decision, due soon in its last 2 days, then late", () => {
    expect(grievanceClock(open(), AT)).toEqual({ kind: "due", at: "2026-12-05T10:00:00Z" });
    expect(grievanceClock(open(), Date.parse("2026-12-03T11:00:00Z")).kind).toBe("due_soon");
    expect(grievanceClock(open(), Date.parse("2026-12-05T10:00:00Z")).kind).toBe("late");
  });

  test("one typed in and not acknowledged: due within 24 hours, then late", () => {
    expect(grievanceClock(open({ acknowledged_at: null }), AT + H)).toEqual({ kind: "ack_due", at: "2026-11-21T10:00:00Z" });
    expect(grievanceClock(open({ acknowledged_at: null }), AT + 25 * H).kind).toBe("ack_late");
  });

  test("a late decision outranks a late acknowledgement", () => {
    expect(grievanceClock(open({ acknowledged_at: null }), Date.parse("2026-12-06T00:00:00Z")).kind).toBe("late");
  });

  test("a decided grievance says whether it was decided in time", () => {
    expect(grievanceClock(open({ state: "decided", decided_at: "2026-12-01T00:00:00Z" }), AT)).toEqual({ kind: "decided", at: "2026-12-01T00:00:00Z", onTime: true });
    expect(grievanceClock(open({ state: "decided", decided_at: "2026-12-06T00:00:00Z" }), AT)).toMatchObject({ onTime: false });
  });
});

test("the limits agree with the database's CHECKs and its daily cap", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-20-compliance-1-grievances.sql"), "utf8");
  expect(sql).toContain(`char_length(name) <= ${GRIEVANCE_LIMITS.name}`);
  expect(sql).toContain(`char_length(email) <= ${GRIEVANCE_LIMITS.email}`);
  expect(sql).toContain(`char_length(about_url) <= ${GRIEVANCE_LIMITS.aboutUrl}`);
  expect(sql).toContain(`char_length(body) <= ${GRIEVANCE_LIMITS.body}`);
  expect(sql).toContain(`char_length(reply) <= ${GRIEVANCE_LIMITS.reply}`);
  expect(sql).toContain(`char_length(body) <= ${GRIEVANCE_LIMITS.note}`);
  expect(sql).toContain(`>= ${FORM_DAILY_CAP} THEN`);
  expect(sql).toContain(`category IN (${GRIEVANCE_CATEGORIES.map((c) => `'${c}'`).join(", ")})`);
  expect(sql).toContain(`outcome IN (${GRIEVANCE_OUTCOMES.map((o) => `'${o}'`).join(", ")})`);
});
