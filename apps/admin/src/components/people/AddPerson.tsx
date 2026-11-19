"use client";

import { useState } from "react";
import Link from "next/link";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS, GRANTABLE_ROLES, MANAGING_EDITOR_GRANTS, defaultDays, needsLanguage } from "@timesprime/shared/config/people";
import { deskCall, useAdminMe } from "../desk/deskClient";
import LinkBox from "./LinkBox";
import { roleLabel, sectionLabel } from "./peopleClient";

// Adding a person (Panel 1 design §4, M2b): their account and a first role. A Managing Editor adds
// Writer, Sub-editor or Desk Editor in their own scope, at once, and gets the one-time link to hand
// over. A Super Admin asks: the second Super Admin who approves gets the link. The roles offered
// follow what /api/admin/me says the person holds; the server decides.

const field = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";

export default function AddPerson() {
  const { me, error: meError } = useAdminMe();
  const held = me?.kind === "staff" ? me.permissions["role.assign"] : undefined;
  const asks = held === "ask";
  const grantable: readonly string[] = asks ? GRANTABLE_ROLES : held === "act" ? MANAGING_EDITOR_GRANTS : [];

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("writer");
  const [language, setLanguage] = useState("hi");
  const [section, setSection] = useState("");
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; staffId?: string } | null>(null);
  const [link, setLink] = useState<{ path: string; who: string } | null>(null);

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (!me) return <p aria-live="polite" className="text-sm text-slate-500">Loading…</p>;
  if (grantable.length === 0) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm">Adding people is for a Super Admin or a Managing Editor.</p>
        <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      </div>
    );
  }

  const pickRole = (r: string) => {
    setRole(r);
    setDays(defaultDays(r));
    if (needsLanguage(r) && !language) setLanguage("hi");
  };

  async function submit() {
    setBusy(true);
    setLink(null);
    const res = await deskCall<{ link?: string; code?: string; userId?: string }>("/api/admin/people", {
      method: "POST",
      body: JSON.stringify({ email, display_name: name, role, language: language || null, section: section || null, days, reason }),
    });
    setBusy(false);
    if (res.status === 201 && res.data?.link) {
      setLink({ path: res.data.link, who: name.trim() });
      setMessage({ ok: true, text: `${name.trim()} is added as ${roleLabel(role)}.` });
      setEmail("");
      setName("");
      setReason("");
    } else if (res.status === 202) {
      setMessage({ ok: true, text: "Asked. A second Super Admin decides it within 72 hours, and gets the link to hand over." });
    } else {
      setMessage({ ok: false, text: res.error ?? "Not added.", staffId: res.data?.code === "staff" ? res.data.userId : undefined });
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      <h1 className="font-serif text-2xl font-extrabold">Add a person</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {asks
          ? "This is a request: a second Super Admin approves it, and gets the person's one-time link to hand over."
          : "You add Writer, Sub-editor or Desk Editor in your own desk, and get the person's one-time link to hand over."}
      </p>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {message.text}{" "}
          {message.staffId && <Link href={`/admin/people/${message.staffId}`} className="font-semibold underline">Open their page</Link>}
        </p>
      )}
      {link && <LinkBox path={link.path} who={link.who} />}

      <section aria-label="The person" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 dark:border-[#2b2f36] dark:bg-[#202327]">
        <label className="text-sm font-semibold">
          Email
          <input className={field} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          Role
          <select className={field} value={role} onChange={(e) => pickRole(e.target.value)}>
            {grantable.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Language
          <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {!needsLanguage(role) && <option value="">All</option>}
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Section
          <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {SECTION_IDS.map((s) => <option key={s} value={s}>{sectionLabel(s)}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          For
          <select className={field} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {EXPIRY_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          Reason
          <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button type="button" className={button} disabled={busy || !email.trim() || !name.trim() || !reason.trim()} onClick={() => void submit()}>
            {asks ? "Ask to add" : "Add"}
          </button>
        </div>
      </section>
    </div>
  );
}
