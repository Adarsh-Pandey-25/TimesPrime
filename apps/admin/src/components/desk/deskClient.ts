"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminMe } from "@timesprime/shared/types";
import type { StoryState } from "@timesprime/shared/config/desk";

// The Desk's screens (Panel 2 design §4) talk to /api/admin/desk/… and decide nothing themselves:
// hiding a button is UX, the server decides every request. These helpers are shared by the screens.

export interface DeskResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/** A Desk API call. Failures, a lapsed session (401) included, come back as text to show. */
export async function deskCall<T>(path: string, init: RequestInit = {}): Promise<DeskResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: "include",
      ...init,
      headers: init.body ? { "content-type": "application/json", ...(init.headers ?? {}) } : init.headers,
    });
    if (res.status === 401) {
      return { ok: false, status: 401, data: null, error: "Your session has ended. Sign in again at /admin/login; unsaved changes stay on this screen." };
    }
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : data?.error || `The Desk answered ${res.status}.` };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error. Nothing was changed." };
  }
}

/** Who is signed in and what they hold (GET /api/admin/me), or why that could not be read. */
export function useAdminMe(): { me: AdminMe | null; error: string } {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await deskCall<AdminMe>("/api/admin/me");
      if (cancelled) return;
      if (res.status === 401) return router.push("/admin/login");
      if (res.ok && res.data) setMe(res.data);
      else setError(res.error ?? "Could not load your access.");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  return { me, error };
}

/** Whether the signed-in person may act with a permission in some desk (the server still decides). */
export function canAct(me: AdminMe | null, permission: string): boolean {
  return Boolean(me && me.kind === "staff" && me.permissions[permission] === "act");
}

export const STATE_LABELS: Record<StoryState, string> = {
  pitch: "Pitch",
  assigned: "Assigned",
  draft: "Draft",
  in_review: "In review",
  desk_review: "Desk review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Taken down",
  retracted: "Retracted",
  killed: "Killed",
};

/** A state's badge colours, readable in both themes. */
export const STATE_STYLES: Record<StoryState, string> = {
  pitch: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  assigned: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  desk_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  unpublished: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  retracted: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  killed: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

/** "17 Nov 2026, 3:05 pm", in IST. */
export function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
