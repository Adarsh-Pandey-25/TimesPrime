"use client";

import { useCallback, useEffect, useState } from "react";
import { deskCall } from "../desk/deskClient";

// What needs a look now (GET /api/admin/people/alerts; Panel 1 design §5 and §6): break-glass in
// use and the review due (Super Admins), and roles ending within 14 days. Shared by the top bar's
// alert and the directory.

export interface BreakGlassView {
  assignmentId: string;
  userId: string;
  name: string | null;
  since: string;
  until: string;
  reason: string;
  mine: boolean;
}

export interface ReviewDueView {
  lastAt: string | null;
  lastByName: string | null;
  dueAt: string;
  overdue: boolean;
}

export interface EndingSoonView {
  assignmentId: string;
  userId: string;
  name: string | null;
  role: string;
  language: string | null;
  section: string | null;
  expiresAt: string;
}

export interface Alerts {
  breakGlass: BreakGlassView[];
  review: ReviewDueView | null;
  endingSoon: EndingSoonView[];
}

const EMPTY: Alerts = { breakGlass: [], review: null, endingSoon: [] };

/** The alerts, reloadable; `enabled` false asks nothing (someone who does not manage people). */
export function useAlerts(enabled: boolean): { alerts: Alerts; reload: () => Promise<void> } {
  const [alerts, setAlerts] = useState<Alerts>(EMPTY);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const res = await deskCall<Partial<Alerts>>("/api/admin/people/alerts");
    if (!res.ok || !res.data) return;
    setAlerts({
      breakGlass: Array.isArray(res.data.breakGlass) ? res.data.breakGlass : [],
      review: res.data.review ?? null,
      endingSoon: Array.isArray(res.data.endingSoon) ? res.data.endingSoon : [],
    });
  }, [enabled]);
  // Necessary setState-in-effect: the alerts come from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { alerts, reload };
}

/** "21:30", in IST. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
}
