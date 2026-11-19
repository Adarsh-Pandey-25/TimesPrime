"use client";

import { useState } from "react";
import Link from "next/link";
import { BREAK_GLASS_HOURS } from "@timesprime/shared/config/people";
import { deskCall, when } from "../desk/deskClient";
import { clock, useAlerts } from "./alerts";
import { day, deskLabel, roleLabel } from "./peopleClient";

// What needs a look, on the directory (Panel 1 design §5 and §6, M3b):
//   - a Super Admin's emergency access (break-glass): start it for themselves with a reason, end it
//     early, and see anyone else's in use;
//   - when the access review is due, with the way to it (Super Admins);
//   - roles ending within 14 days, to renew in time (everyone who manages people, their people).
// The server decides each request.

const field = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";
const card = "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2b2f36] dark:bg-[#202327]";

export default function AlertsPanel({ superAdmin }: { superAdmin: boolean }) {
  const { alerts, reload } = useAlerts(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = alerts.breakGlass.find((b) => b.mine) ?? null;
  const others = alerts.breakGlass.filter((b) => !b.mine);

  async function breakGlass(start: boolean) {
    setBusy(true);
    const res = await deskCall<{ until?: string }>("/api/admin/people/break-glass", start ? { method: "POST", body: JSON.stringify({ reason }) } : { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "Not done." });
    setMessage({ ok: true, text: start ? `Emergency access is on until ${res.data?.until ? clock(res.data.until) : "2 hours from now"}. Take the story down on the Desk, then end it here.` : "Emergency access is ended." });
    if (start) setReason("");
    await reload();
  }

  return (
    <div className="space-y-4">
      {superAdmin && (
        <section aria-label="Emergency access" className={card}>
          <h2 className="font-serif text-lg font-bold">Emergency access (break-glass)</h2>
          <p className="text-xs text-slate-500">
            For the night a story must come down and no editor answers: {BREAK_GLASS_HOURS} hours, to take articles and stories down, and nothing else. The other Super
            Admins see it at once; every step is in the audit log.
          </p>
          {message && (
            <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>
          )}
          {others.map((b) => (
            <p key={b.assignmentId} className="text-sm font-semibold text-red-700 dark:text-red-300">
              {b.name ?? "A Super Admin"} has emergency access until {clock(b.until)}. Reason: {b.reason}
            </p>
          ))}
          {mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Yours is on until {clock(mine.until)}.</p>
              <button type="button" className={button} disabled={busy} onClick={() => void breakGlass(false)}>End it now</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[16rem] flex-1 text-sm font-semibold">
                Why (the order, who called, what must come down)
                <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void breakGlass(true)}>Start emergency access</button>
            </div>
          )}
        </section>
      )}

      {superAdmin && alerts.review && (
        <p className="text-sm">
          <span className={alerts.review.overdue ? "font-semibold text-amber-700 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}>
            {alerts.review.lastAt
              ? `Last access review: ${day(alerts.review.lastAt)}${alerts.review.lastByName ? ` by ${alerts.review.lastByName}` : ""}. Next due: ${day(alerts.review.dueAt)}.`
              : "No access review yet."}
          </span>{" "}
          <Link href="/admin/people/review" className="font-semibold text-blue-700 dark:text-blue-300">{alerts.review.overdue ? "Start the review" : "Open the review"}</Link>
        </p>
      )}

      {alerts.endingSoon.length > 0 && (
        <section aria-label="Roles ending soon" className={card}>
          <h2 className="font-serif text-lg font-bold">Roles ending within 14 days</h2>
          <ul className="space-y-1 text-sm">
            {alerts.endingSoon.map((e) => (
              <li key={e.assignmentId}>
                <Link href={`/admin/people/${e.userId}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{e.name ?? "Someone"}</Link>{" "}
                <span className="text-slate-600 dark:text-slate-300">· {roleLabel(e.role)} · {deskLabel(e)} · ends {when(e.expiresAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
