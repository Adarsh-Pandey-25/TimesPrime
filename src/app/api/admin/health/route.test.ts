/**
 * @jest-environment node
 */

jest.mock("@/server/health", () => ({ getHealth: jest.fn() }));

import { GET } from "./route";

const { getHealth } = jest.requireMock("@/server/health") as { getHealth: jest.Mock };

const report = {
  status: "degraded",
  checkedAt: "2026-10-30T00:00:00.000Z",
  dependencies: {
    supabase: { configured: true, ok: false, error: "ENOTFOUND", latencyMs: 12 },
    redis: { configured: false, ok: true },
    newsdata: { configured: true, ok: true },
    anthropic: { configured: false, ok: true },
  },
};

// The session check lives in src/proxy.ts, not here; the next start probe
// covers it (no session -> 401).
describe("GET /api/admin/health (behind the admin session)", () => {
  test("returns the per-dependency detail, 503 while degraded", async () => {
    getHealth.mockResolvedValue(report);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(report);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("returns 200 when healthy", async () => {
    getHealth.mockResolvedValue({ ...report, status: "ok" });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
