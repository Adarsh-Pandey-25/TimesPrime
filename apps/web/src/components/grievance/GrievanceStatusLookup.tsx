"use client";

import { useState } from "react";
import { GRIEVANCE_OUTCOME_LABELS, GRIEVANCE_LIMITS, type GrievanceOutcome } from "@timesprime/shared/config/grievances";
import { useLanguage } from "@/context/LanguageContext";
import { GRIEVANCE_TEXT, grievanceDate } from "./grievanceText";

// A grievance's status (Panel 7 design §4, M1): the ticket and the email in; the state, the dates
// and, once decided, the decision and the reply out, in the reader's language. Sent by POST, so the
// email is never in an address.

type ErrorCode = keyof (typeof GRIEVANCE_TEXT)["en"]["statusErrors"] | "not_found";
interface Status {
  ticket: string;
  state: "open" | "decided";
  received_at: string;
  acknowledged_at: string | null;
  decide_due_at: string;
  outcome: GrievanceOutcome | null;
  reply: string | null;
  decided_at: string | null;
}

const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30 dark:border-[#383d45] dark:bg-[#1a1c1e] dark:text-slate-100";
const labelClass = "block text-sm font-semibold text-slate-800 dark:text-slate-200";

export default function GrievanceStatusLookup() {
  const { language } = useLanguage();
  const t = GRIEVANCE_TEXT[language];
  const [ticket, setTicket] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/grievances/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket, email }),
      });
      const data = (await res.json().catch(() => null)) as { grievance?: Status; code?: string } | null;
      if (res.ok && data?.grievance) setStatus(data.grievance);
      else setError(data?.code === "not_found" || (data?.code && data.code in t.statusErrors) ? (data.code as ErrorCode) : "failed");
    } catch {
      setError("failed");
    }
    setBusy(false);
  };

  const date = (iso: string) => grievanceDate(iso, language);
  return (
    <div className="space-y-5" lang={language}>
      <form onSubmit={submit} aria-label={t.statusTitle} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.statusIntro}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            {t.ticket}
            <input value={ticket} onChange={(e) => setTicket(e.target.value)} required maxLength={20} placeholder="G-2026-00042" autoComplete="off" className={`${field} font-mono`} />
          </label>
          <label className={labelClass}>
            {t.yourEmail}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={GRIEVANCE_LIMITS.email} autoComplete="email" className={field} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
          {busy ? t.showing : t.show}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error === "not_found" ? t.notFound : t.statusErrors[error]}
        </p>
      )}

      {status && (
        <section aria-label={status.ticket} role="status" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-[#383d45] dark:bg-[#1f2226]">
          <p className="font-mono text-base font-bold">{status.ticket}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t.received(date(status.received_at))}
            {status.acknowledged_at ? `, ${t.acknowledged(date(status.acknowledged_at))}` : ""}.
          </p>
          {status.state === "open" || !status.outcome || !status.decided_at ? (
            <>
              <p className="text-sm font-semibold">{t.open}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{t.due(date(status.decide_due_at))}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{t.decided(date(status.decided_at), GRIEVANCE_OUTCOME_LABELS[status.outcome][language])}</p>
              {status.reply && (
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.reply}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{status.reply}</p>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
