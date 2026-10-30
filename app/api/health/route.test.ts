/**
 * @jest-environment node
 */

jest.mock("@/server/health", () => ({ getHealth: jest.fn() }));

import { GET } from "./route";

const { getHealth } = jest.requireMock("@/server/health") as { getHealth: jest.Mock };

const detail = {
  checkedAt: "2026-10-30T00:00:00.000Z",
  dependencies: {
    supabase: { configured: true, ok: false, error: "ENOTFOUND", latencyMs: 12 },
    redis: { configured: false, ok: true },
    newsdata: { configured: true, ok: true },
    anthropic: { configured: false, ok: true },
  },
};

describe("GET /api/health (public)", () => {
  test("answers 200 with the status only when healthy", async () => {
    getHealth.mockResolvedValue({ ...detail, status: "ok" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("answers 503 with the status only when degraded — no dependency detail", async () => {
    getHealth.mockResolvedValue({ ...detail, status: "degraded" });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "degraded" });
    expect(JSON.stringify(body)).not.toMatch(/supabase|ENOTFOUND|dependencies/);
  });
});
