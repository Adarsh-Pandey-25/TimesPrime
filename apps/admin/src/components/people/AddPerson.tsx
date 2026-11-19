"use client";

import { useState } from "react";
import Link from "next/link";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS, GRANTABLE_ROLES, MANAGING_EDITOR_GRANTS, defaultDays, needsLanguage } from "@timesprime/shared/config/people";
import { deskCall, useAdminMe } from "../desk/deskClient";
import LinkBox from "./LinkBox";
import { roleLabel, sectionLabel } from "./peopleClient";
import { backLink, buttonPrimary, card, field as baseField, hint, label, pageTitle } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// Adding a person (Panel 1 design §4, M2b): their account and a first role. A Managing Editor adds
// Writer, Sub-editor or Desk Editor in their own scope, at once, and gets the one-time link to hand
// over. A Super Admin asks: the second Super Admin who approves gets the link. The roles offered
// follow what /api/admin/me says the person holds; the server decides.

const field = `mt-1 ${baseField}`;

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
        <Link href="/admin/people" className={backLink}>← All people</Link>
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

  const step = "flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  const legend = "mb-3 flex items-center gap-2 text-sm font-bold";
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/people" className={backLink}>← All people</Link>
      <header className="space-y-1">
        <h1 className={pageTitle}>Add a person</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {asks
            ? "This is a request: a second Super Admin approves it, and gets the person's one-time link to hand over."
            : "You add Writer, Sub-editor or Desk Editor in your own desk, and get the person's one-time link to hand over."}
        </p>
      </header>

      {/* One form in three steps, in the order it is thought through: who, what access, why. */}
      <section aria-label="The person" className={`${card} space-y-5`}>
        <fieldset>
          <legend className={`${legend} float-left w-full`}><span className={step}>1</span> Who</legend>
          <div className="clear-both grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Email
              <input className={field} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className={label}>
              Name
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
          <legend className={`${legend} float-left w-full`}><span className={step}>2</span> Their first role</legend>
          <div className="clear-both grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              Role
              <select className={field} value={role} onChange={(e) => pickRole(e.target.value)}>
                {grantable.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </label>
            <label className={label}>
              Language
              <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {!needsLanguage(role) && <option value="">All</option>}
                <option value="hi">Hindi</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className={label}>
              Section
              <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">All sections</option>
                {SECTION_IDS.map((s) => <option key={s} value={s}>{sectionLabel(s)}</option>)}
              </select>
            </label>
            <label className={label}>
              For
              <select className={field} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {EXPIRY_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
          <legend className={`${legend} float-left w-full`}><span className={step}>3</span> Why</legend>
          <label className={`${label} clear-both`}>
            Reason
            <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
          <span className={hint}>Email, name and a reason are needed.</span>
          <button type="button" className={buttonPrimary} disabled={busy || !email.trim() || !name.trim() || !reason.trim()} onClick={() => void submit()}>
            {asks ? "Ask to add" : "Add"}
          </button>
        </div>

        {/* The answer, beside the button: a refusal with the way to their page, or the link to hand over. */}
        <ActionMessage message={message}>{message?.staffId && <Link href={`/admin/people/${message.staffId}`} className="font-semibold underline">Open their page</Link>}</ActionMessage>
        {link && <LinkBox path={link.path} who={link.who} />}
      </section>
    </div>
  );
}
