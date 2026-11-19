"use client";

import { useState } from "react";
import Link from "next/link";
import { BREAK_GLASS_HOURS } from "@timesprime/shared/config/people";
import { deskCall, when } from "../desk/deskClient";
import { clock, useAlerts } from "./alerts";
import { day, deskLabel, roleLabel } from "./peopleClient";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { button, buttonDanger, buttonPrimary, card, cardTitle, field as baseField, hint, label, link, tone } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// What needs a look, on the directory (Panel 1 design §5 and §6, M3b):
//   - a Super Admin's emergency access (break-glass): start it for themselves with a reason, end it
//     early, and see anyone else's in use;
//   - when the access review is due, with the way to it (Super Admins);
//   - roles ending within 14 days, to renew in time (everyone who manages people, their people).
// The server decides each request.

const field = `mt-0.5 ${baseField}`;

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

  const anyOn = Boolean(mine) || others.length > 0;
  if (!superAdmin && alerts.endingSoon.length === 0) return null;
  return (
    <div className="space-y-4">
      {superAdmin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-label="Emergency access" className={`${card} ${anyOn ? "border-red-300 dark:border-red-900" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${anyOn ? tone.red : tone.slate}`}>
                <ShieldAlert aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <h2 className={cardTitle}>Emergency access (break-glass)</h2>
                <p className={hint}>
                  For the night a story must come down and no editor answers: {BREAK_GLASS_HOURS} hours, to take articles and stories down, and nothing else. The other Super
                  Admins see it at once; every step is in the audit log.
                </p>
              </div>
            </div>
            {others.map((b) => (
              <p key={b.assignmentId} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {b.name ?? "A Super Admin"} has emergency access until {clock(b.until)}. Reason: {b.reason}
              </p>
            ))}
            {mine ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">Yours is on until {clock(mine.until)}.</p>
                <button type="button" className={button} disabled={busy} onClick={() => void breakGlass(false)}>End it now</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${label} min-w-[14rem] flex-1`}>
                  Why (the order, who called, what must come down)
                  <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <button type="button" className={buttonDanger} disabled={busy || !reason.trim()} onClick={() => void breakGlass(true)}>Start emergency access</button>
              </div>
            )}
            <ActionMessage message={message} />
          </section>

          {alerts.review && (
            <section aria-label="Access review" className={`${card} ${alerts.review.overdue ? "border-amber-300 dark:border-amber-800" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${alerts.review.overdue ? tone.amber : tone.slate}`}>
                  <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <h2 className={cardTitle}>Access review</h2>
                  <p className={alerts.review.overdue ? "text-sm font-semibold text-amber-800 dark:text-amber-200" : "text-sm text-slate-600 dark:text-slate-300"}>
                    {alerts.review.lastAt
                      ? `Last access review: ${day(alerts.review.lastAt)}${alerts.review.lastByName ? ` by ${alerts.review.lastByName}` : ""}. Next due: ${day(alerts.review.dueAt)}.`
                      : "No access review yet."}
                  </p>
                  <p className={hint}>Every 90 days: every role kept, revoked or renewed.</p>
                </div>
              </div>
              <Link href="/admin/people/review" className={alerts.review.overdue ? buttonPrimary : button}>
                {alerts.review.overdue ? "Start the review" : "Open the review"}
              </Link>
            </section>
          )}
        </div>
      )}

      {alerts.endingSoon.length > 0 && (
        <section aria-label="Roles ending soon" className={`${card} border-amber-200 dark:border-amber-900`}>
          <h2 className={cardTitle}>Roles ending within 14 days</h2>
          <ul className="space-y-1.5 text-sm">
            {alerts.endingSoon.map((e) => (
              <li key={e.assignmentId}>
                <Link href={`/admin/people/${e.userId}`} className={link}>{e.name ?? "Someone"}</Link>{" "}
                <span className="text-slate-600 dark:text-slate-300">· {roleLabel(e.role)} · {deskLabel(e)} · ends {when(e.expiresAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
