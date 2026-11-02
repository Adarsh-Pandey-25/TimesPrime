/**
 * @jest-environment node
 */

jest.mock("@/backend/services/health/health", () => ({ getHealth: jest.fn() }));
// The gate is tested in access.test.ts; here it lets the request through.
jest.mock("@/backend/auth/requirePermission", () => ({ requirePermission: jest.fn(async () => ({ ok: true, actor: {} })) }));

import { NextRequest } from "next/server";
import { GET as handler } from "./health";

const GET = () => handler(new NextRequest("http://localhost:3000/api/admin/health"));

const { getHealth } = jest.requireMock("@/backend/services/health/health") as { getHealth: jest.Mock };

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

// The permission check (health.view) is covered by access.test.ts.
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
