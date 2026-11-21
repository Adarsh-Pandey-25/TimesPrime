"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { GRIEVANCE_CATEGORIES, GRIEVANCE_CATEGORY_LABELS, GRIEVANCE_LIMITS, type GrievanceCategory } from "@timesprime/shared/config/grievances";
import { useLanguage } from "@/context/LanguageContext";
import { GRIEVANCE_TEXT, grievanceDate } from "./grievanceText";

// The grievance form (Panel 7 design §4, M1), in the reader's language. On sending, the reader gets
// the ticket and the date the decision is due, and the way to the status page. The server decides
// everything (POST /api/grievances); a refusal is told in the reader's language by its code.

type ErrorCode = keyof (typeof GRIEVANCE_TEXT)["en"]["errors"];
interface Sent {
  ticket: string;
  decide_due_at: string;
}

const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30 dark:border-[#383d45] dark:bg-[#1a1c1e] dark:text-slate-100";
const labelClass = "block text-sm font-semibold text-slate-800 dark:text-slate-200";
const hint = "mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400";

export default function GrievanceForm() {
  const { language } = useLanguage();
  const t = GRIEVANCE_TEXT[language];
  const ids = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [aboutUrl, setAboutUrl] = useState("");
  const [category, setCategory] = useState<GrievanceCategory>("factual_error");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ErrorCode; detail: string | null } | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/grievances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language, name, email, about_url: aboutUrl.trim() || null, category, body, website }),
      });
      const data = (await res.json().catch(() => null)) as (Sent & { code?: string; error?: string }) | null;
      if (res.status === 201 && data?.ticket) {
        setSent({ ticket: data.ticket, decide_due_at: data.decide_due_at });
      } else {
        const code = data?.code && data.code in t.errors ? (data.code as ErrorCode) : "failed";
        setError({ code, detail: code === "invalid" ? (data?.error ?? null) : null });
      }
    } catch {
      setError({ code: "failed", detail: null });
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/40">
        <p className="flex items-center gap-2 font-bold text-green-800 dark:text-green-200">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
          {t.sentTitle}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {t.sentTicket}: <strong className="font-mono text-base text-slate-900 dark:text-white">{sent.ticket}</strong>
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{t.sentDue(grievanceDate(sent.decide_due_at, language))}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{t.sentKeep}</p>
        <Link href="/grievance/status" className="inline-block text-sm font-semibold text-red-600 hover:underline dark:text-red-400">
          {t.statusLink} →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-label={t.formTitle} lang={language} className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">{t.formIntro}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          {t.name}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={GRIEVANCE_LIMITS.name} autoComplete="name" className={field} />
        </label>
        <label className={labelClass}>
          {t.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={GRIEVANCE_LIMITS.email} autoComplete="email" className={field} />
        </label>
      </div>
      <div>
        <label className={labelClass}>
          {t.aboutUrl}
          <input
            value={aboutUrl}
            onChange={(e) => setAboutUrl(e.target.value)}
            maxLength={GRIEVANCE_LIMITS.aboutUrl}
            inputMode="url"
            placeholder="https://timesprime247.com/…"
            aria-describedby={`${ids}-about`}
            className={field}
          />
        </label>
        <span id={`${ids}-about`} className={hint}>
          {t.aboutUrlHint}
        </span>
      </div>
      <label className={labelClass}>
        {t.category}
        <select value={category} onChange={(e) => setCategory(e.target.value as GrievanceCategory)} className={field}>
          {GRIEVANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {GRIEVANCE_CATEGORY_LABELS[c][language]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <label className={labelClass}>
          {t.body}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={GRIEVANCE_LIMITS.body} rows={7} aria-describedby={`${ids}-body`} className={field} />
        </label>
        <span id={`${ids}-body`} className={hint}>
          {t.bodyHint(GRIEVANCE_LIMITS.body)}
        </span>
      </div>
      {/* A field a person never sees, so never fills: a form filled in by a program is refused. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.notice}</p>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {t.errors[error.code]}
          {error.detail && <span className="block text-xs">{error.detail}</span>}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
      >
        {busy ? t.sending : t.send}
      </button>
    </form>
  );
}
