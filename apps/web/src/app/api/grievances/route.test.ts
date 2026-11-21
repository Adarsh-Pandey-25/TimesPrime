/**
 * @jest-environment node
 *
 * The grievance form's route (Panel 7 design §4, M1): a whole grievance is sent through
 * grievance_submit and answered with its ticket; a partial one, a filled hidden field, or one over a
 * limit is refused with a code the form words in the reader's language, and nothing is written.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@timesprime/server/lib/rateLimit", () => ({
  checkRateLimits: jest.fn(),
  checkGlobalRateLimit: jest.fn(),
  getClientIp: jest.fn(() => "203.0.113.7"),
}));
jest.mock("@timesprime/server/repositories/grievances", () => {
  class GrievanceStoreError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  return { GrievanceStoreError, submitGrievance: jest.fn(), storyIdByNumber: jest.fn(), grievanceStatus: jest.fn() };
});

import { NextRequest } from "next/server";
import { POST } from "./route";
import { POST as STATUS } from "./status/route";

const rate = jest.requireMock("@timesprime/server/lib/rateLimit") as { checkRateLimits: jest.Mock; checkGlobalRateLimit: jest.Mock };
const store = jest.requireMock("@timesprime/server/repositories/grievances") as {
  GrievanceStoreError: new (status: number, message: string) => Error;
  submitGrievance: jest.Mock;
  storyIdByNumber: jest.Mock;
  grievanceStatus: jest.Mock;
};
const Sentry = jest.requireMock("@sentry/nextjs") as { captureException: jest.Mock };

const FORM = { language: "hi", name: "Asha Rao", email: "asha@example.com", about_url: null, category: "factual_error", body: "स्कोर गलत था।", website: "" };
const post = (body: unknown, url = "http://localhost/api/grievances") =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const send = async (body: unknown) => {
  const res = await POST(post(body));
  return { status: res.status, json: await res.json(), cache: res.headers.get("cache-control"), retry: res.headers.get("retry-after") };
};
const OPEN = { limited: false, retryAfterSeconds: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  rate.checkRateLimits.mockResolvedValue(OPEN);
  rate.checkGlobalRateLimit.mockResolvedValue(OPEN);
  store.submitGrievance.mockResolvedValue({ ticket: "G-2026-00042", received_at: "2026-11-21T06:00:00Z", decide_due_at: "2026-12-06T06:00:00Z" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/grievances", () => {
  test("a whole grievance is sent, and answered with its ticket and due date, never cached", async () => {
    const r = await send(FORM);
    expect(r).toMatchObject({ status: 201, cache: "no-store", json: { ticket: "G-2026-00042", decide_due_at: "2026-12-06T06:00:00Z" } });
    expect(store.submitGrievance).toHaveBeenCalledWith(
      { language: "hi", name: "Asha Rao", email: "asha@example.com", aboutUrl: null, category: "factual_error", body: "स्कोर गलत था।" },
      null
    );
    expect(store.storyIdByNumber).not.toHaveBeenCalled();
  });

  test("a Desk story's address links the story, published only; a failed lookup leaves it unlinked", async () => {
    store.storyIdByNumber.mockResolvedValue("s-1");
    await send({ ...FORM, about_url: "https://timesprime247.com/hi/sports/match-12" });
    expect(store.storyIdByNumber).toHaveBeenCalledWith(12, true);
    expect(store.submitGrievance.mock.calls[0][1]).toBe("s-1");
    store.storyIdByNumber.mockRejectedValue(new Error("down"));
    expect((await send({ ...FORM, about_url: "/india/budget-7" })).status).toBe(201);
    expect(store.submitGrievance.mock.calls[1][1]).toBeNull();
    await send({ ...FORM, about_url: "The story about the match" });
    expect(store.storyIdByNumber).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["not JSON", "{"],
    ["not an object", [FORM]],
    ["the hidden field filled", { ...FORM, website: "https://spam.example" }],
    ["no name", { ...FORM, name: "" }],
    ["a bad email", { ...FORM, email: "asha@" }],
    ["an unknown category", { ...FORM, category: "rude" }],
    ["no grievance", { ...FORM, body: "  " }],
    ["a grievance too long", { ...FORM, body: "x".repeat(5001) }],
  ])("%s: 400 invalid, nothing counted or written", async (_name, body) => {
    const r = await send(body);
    expect(r).toMatchObject({ status: 400, cache: "no-store", json: { code: "invalid" } });
    expect(rate.checkRateLimits).not.toHaveBeenCalled();
    expect(store.submitGrievance).not.toHaveBeenCalled();
  });

  test("a body over 16 KB: 413", async () => {
    expect((await send({ ...FORM, body: "x".repeat(17 * 1024) })).status).toBe(413);
    expect(store.submitGrievance).not.toHaveBeenCalled();
  });

  test("decision 3: 3 an hour and 10 a day per address, then 500 a day for the site; 429 with Retry-After", async () => {
    await send(FORM);
    expect(rate.checkRateLimits).toHaveBeenCalledWith("203.0.113.7", [
      { name: "grievance-hour", limit: 3, windowSeconds: 3600 },
      { name: "grievance-day", limit: 10, windowSeconds: 86400 },
    ]);
    expect(rate.checkGlobalRateLimit).toHaveBeenCalledWith({ name: "grievance-site-day", limit: 500, windowSeconds: 86400 });

    rate.checkRateLimits.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 120, rule: "grievance-hour" });
    expect(await send(FORM)).toMatchObject({ status: 429, retry: "120", json: { code: "too_many" } });
    rate.checkGlobalRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 600 });
    expect(await send(FORM)).toMatchObject({ status: 429, json: { code: "closed_today" } });
    expect(store.submitGrievance).toHaveBeenCalledTimes(1);
  });

  test("the database's own refusals: its daily cap is closed_today; a value it refuses is invalid; a failure is 503 and Sentry", async () => {
    store.submitGrievance.mockRejectedValueOnce(new store.GrievanceStoreError(429, "The form takes no more grievances today."));
    expect(await send(FORM)).toMatchObject({ status: 429, json: { code: "closed_today" } });
    store.submitGrievance.mockRejectedValueOnce(new store.GrievanceStoreError(422, "check"));
    expect(await send(FORM)).toMatchObject({ status: 400, json: { code: "invalid" } });
    store.submitGrievance.mockRejectedValueOnce(new Error("timeout"));
    expect(await send(FORM)).toMatchObject({ status: 503, json: { code: "failed" } });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/grievances/status", () => {
  const ask = async (body: unknown) => {
    const res = await STATUS(post(body, "http://localhost/api/grievances/status"));
    return { status: res.status, json: await res.json(), cache: res.headers.get("cache-control") };
  };
  const STATUS_ROW = { ticket: "G-2026-00042", state: "open", received_at: "2026-11-21T06:00:00Z", acknowledged_at: "2026-11-21T06:00:00Z", decide_due_at: "2026-12-06T06:00:00Z", outcome: null, reply: null, decided_at: null };

  test("with the ticket (as typed) and the email: the grievance's status, never cached", async () => {
    store.grievanceStatus.mockResolvedValue(STATUS_ROW);
    expect(await ask({ ticket: " g-2026-00042 ", email: " asha@example.com " })).toMatchObject({ status: 200, cache: "no-store", json: { grievance: STATUS_ROW } });
    expect(store.grievanceStatus).toHaveBeenCalledWith("G-2026-00042", "asha@example.com");
  });

  test("a wrong pair is 404, said the same way for a wrong email and an unknown ticket", async () => {
    store.grievanceStatus.mockResolvedValue(null);
    expect(await ask({ ticket: "G-2026-00042", email: "other@example.com" })).toMatchObject({ status: 404, json: { code: "not_found" } });
  });

  test("20 tries an hour per address, counted before anything is read", async () => {
    rate.checkRateLimits.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 900 });
    expect(await ask({ ticket: "G-2026-00042", email: "asha@example.com" })).toMatchObject({ status: 429, json: { code: "too_many" } });
    expect(rate.checkRateLimits).toHaveBeenCalledWith("203.0.113.7", [{ name: "grievance-status-hour", limit: 20, windowSeconds: 3600 }]);
    expect(store.grievanceStatus).not.toHaveBeenCalled();
  });

  test.each([
    ["no ticket", { email: "asha@example.com" }],
    ["a bad ticket", { ticket: "42", email: "asha@example.com" }],
    ["no email", { ticket: "G-2026-00042" }],
    ["not JSON", "{"],
  ])("%s: 400", async (_name, body) => {
    expect((await ask(body)).status).toBe(400);
    expect(store.grievanceStatus).not.toHaveBeenCalled();
  });

  test("a failure is 503 and Sentry", async () => {
    store.grievanceStatus.mockRejectedValue(new Error("down"));
    expect(await ask({ ticket: "G-2026-00042", email: "asha@example.com" })).toMatchObject({ status: 503, json: { code: "failed" } });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
