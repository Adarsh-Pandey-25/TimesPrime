"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StoryLanguage, StoryState } from "@timesprime/shared/config/desk";
import { ShieldAlert } from "lucide-react";
import { deskCall, STATE_LABELS, STATE_STYLES, when } from "./deskClient";
import { card, cardTitle, hint, item, link, tone } from "../ui/styles";

// The Desk's alert list (Panel 2 design §8, owner decision 5): every story unpublished or retracted
// in the last 30 days, in the person's desks, with who took it down, when and why, and whether it is
// live again. Shown to whoever may take stories down; the server keeps the list to their desks.

interface Alert {
  id: number;
  action: "unpublish" | "retract";
  reason: string | null;
  at: string;
  by: string;
  story: { id: string; language: StoryLanguage; section: string; workflow_state: StoryState; headline: string | null };
}

/** The state each takedown leaves a story in, for its label and colour. */
const LEFT_AS: Record<Alert["action"], StoryState> = { unpublish: "unpublished", retract: "retracted" };

export default function AlertList() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");

  // Necessary setState-in-effect: the alerts come from an async fetch, which cannot run during render.
  useEffect(() => {
    let live = true;
    void deskCall<{ alerts: Alert[]; days: number }>("/api/admin/desk/alerts").then((res) => {
      if (!live) return;
      if (res.ok && res.data) {
        setAlerts(res.data.alerts);
        setDays(res.data.days);
      } else {
        setError(res.error ?? "Could not load the alerts.");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="alerts-heading" className={`${card} ${alerts && alerts.length > 0 ? "border-red-200 dark:border-red-900" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${alerts && alerts.length > 0 ? tone.red : tone.slate}`}>
          <ShieldAlert aria-hidden="true" className="h-4 w-4" />
        </span>
        <h2 id="alerts-heading" className={cardTitle}>Alerts: stories taken down in the last {days} days</h2>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : alerts === null ? (
        <p aria-live="polite" className="text-sm text-slate-500">Loading the alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-slate-500">No story was taken down in your desks.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.map((a) => (
            <li key={a.id} className={item}>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[LEFT_AS[a.action]]}`}>{STATE_LABELS[LEFT_AS[a.action]]}</span>{" "}
              <Link href={`/admin/desk/${a.story.id}`} lang={a.story.language} className={link}>
                {a.story.headline || "(no headline)"}
              </Link>
              {a.story.workflow_state === "published" && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES.published}`}>Live again</span>
              )}
              <span className={`${hint} mt-1 block`}>
                {a.reason ?? "No reason recorded"} · by {a.by} · {when(a.at)} · {a.story.language === "hi" ? "Hindi" : "English"} · {a.story.section}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
