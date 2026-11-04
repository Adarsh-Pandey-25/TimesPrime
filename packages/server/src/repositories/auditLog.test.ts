/**
 * @jest-environment node
 *
 * The audit writers (design §6). recordAudit is a control, not observability: it throws, so the
 * caller refuses a change it could not record (Q2, fail closed). recordSystemAudit is for the cron:
 * a run must not stop because its log line failed, so it reports and carries on.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));

import * as Sentry from "@sentry/nextjs";
import { AuditWriteError, recordAudit, recordSystemAudit, type AuditRow } from "./auditLog";

const { supabase, isSupabaseConfigured } = jest.requireMock("../lib/supabase") as {
  supabase: { from: jest.Mock };
  isSupabaseConfigured: jest.Mock;
};

let inserted: unknown[];
let result: { data: unknown; error: unknown };

beforeEach(() => {
  inserted = [];
  result = { data: { id: "audit-id-1" }, error: null };
  supabase.from.mockReset();
  supabase.from.mockImplementation(() => ({
    insert: (rows: unknown) => {
      inserted.push(rows);
      return { select: () => ({ single: () => Promise.resolve(result) }) };
    },
  }));
  isSupabaseConfigured.mockReturnValue(true);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

const row: AuditRow = {
  actor_type: "staff",
  actor_id: "u-1",
  actor_label: "Asha",
  actor_roles: [{ role: "desk_editor", language: "hi", section: null }],
  aal: "aal2",
  action: "article.edit",
  outcome: "attempted",
  entity_type: "article",
  entity_id: "a-1",
  language: "hi",
  section: "sports",
};

describe("recordAudit", () => {
  test("inserts one row into audit_log and returns its id", async () => {
    expect(await recordAudit(row)).toBe("audit-id-1");
    expect(supabase.from).toHaveBeenCalledWith("audit_log");
    expect(inserted).toEqual([row]);
  });

  test("a database error throws AuditWriteError", async () => {
    result = { data: null, error: { message: "permission denied for table audit_log" } };
    await expect(recordAudit(row)).rejects.toBeInstanceOf(AuditWriteError);
  });

  test("an exception throws AuditWriteError", async () => {
    supabase.from.mockImplementation(() => {
      throw new Error("fetch failed");
    });
    await expect(recordAudit(row)).rejects.toBeInstanceOf(AuditWriteError);
  });

  test("Supabase not configured throws: no audit, no change", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    await expect(recordAudit(row)).rejects.toBeInstanceOf(AuditWriteError);
  });
});

describe("recordSystemAudit", () => {
  const cron: AuditRow = { actor_type: "system", actor_id: null, actor_label: "system:cron", action: "cron.refresh_news", outcome: "succeeded" };

  test("writes the row", async () => {
    await recordSystemAudit(cron);
    expect(inserted).toEqual([cron]);
  });

  test("never throws; reports a failure to Sentry instead", async () => {
    result = { data: null, error: { message: "boom" } };
    await expect(recordSystemAudit(cron)).resolves.toBeUndefined();
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });
});
