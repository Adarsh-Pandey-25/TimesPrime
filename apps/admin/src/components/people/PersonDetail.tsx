"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS, defaultDays, needsLanguage } from "@timesprime/shared/config/people";
import { deskCall, when } from "../desk/deskClient";
import LinkBox from "./LinkBox";
import {
  day,
  describeRequest,
  deskLabel,
  doneOrAsked,
  roleLabel,
  sectionLabel,
  type CallerView,
  type HistoryView,
  type PersonView,
  type Plan,
  type RequestView,
  type RoleView,
} from "./peopleClient";

// One staff member (Panel 1 design §4): their account, every role they hold or held, the requests
// about them, and what was done to them (for holders of audit.read). The actions shown are the ones
// the API says the caller may take (`can`): "act" does it at once, "ask" makes a request a second
// Super Admin decides. Every change carries a reason. The server decides each request.

interface Detail {
  person: PersonView;
  assignments: RoleView[];
  requests: RequestView[];
  history: HistoryView[] | null;
  can: {
    rename: Plan;
    suspend: Plan;
    reactivate: Plan;
    signOut: Plan;
    grant: Plan;
    passwordLink: Plan;
    mfaReset: Plan;
    roles: Record<string, { renew: Plan; revoke: Plan }>;
  };
  caller: CallerView;
}

const field = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";
const card = "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2b2f36] dark:bg-[#202327]";
const STATE_LABEL: Record<RoleView["state"], string> = { live: "Live", expired: "Expired", revoked: "Revoked" };
const OUTCOME_LABEL: Record<string, string> = { approved: "Approved", declined: "Declined", cancelled: "Cancelled" };

/** A button's words for a plan: "Rename" at once, "Ask to rename" for a request. */
const verb = (plan: Plan, word: string) => (plan === "ask" ? `Ask to ${word.toLowerCase()}` : word);

export default function PersonDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // A one-time link the server just made: shown once, never kept (M2).
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await deskCall<Detail>(`/api/admin/people/${id}`);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not load this person.");
      return;
    }
    setError("");
    setDetail(res.data);
  }, [id]);

  // Necessary setState-in-effect: the person comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** One change: its answer becomes the message, and the page reloads. */
  async function change(path: string, body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setLink(null);
    const res = await deskCall<{ link?: string }>(`/api/admin/people/${id}${path}`, { method: path ? "POST" : "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: doneOrAsked(res.status, done) } : { ok: false, text: res.error ?? "Not done." });
    if (res.ok && res.data?.link) setLink(res.data.link);
    if (res.ok) await load();
    return res.ok;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</p>
        <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      </div>
    );
  }
  if (!detail) return <p aria-live="polite" className="text-sm text-slate-500">Loading…</p>;

  const { person, assignments, requests, history, can, caller } = detail;
  return (
    <div className="space-y-6">
      <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      <section aria-label="Account" className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl font-extrabold">{person.name}</h1>
          <span className={person.status === "active" ? "text-sm text-green-700 dark:text-green-300" : "text-sm font-bold text-red-700 dark:text-red-300"}>
            {person.status === "active" ? "Active" : "Suspended"}
          </span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Email</dt><dd>{person.email ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Second factor</dt><dd>{person.hasFactor === null ? "—" : person.hasFactor ? "Set" : "Not set yet"}</dd></div>
          <div><dt className="text-xs text-slate-500">Last sign-in</dt><dd>{person.lastSignInAt ? when(person.lastSignInAt) : "Not signed in yet"}</dd></div>
          <div><dt className="text-xs text-slate-500">Staff since</dt><dd>{day(person.createdAt)}</dd></div>
        </dl>
        {caller.asks && (
          <p className="text-xs text-slate-500">Adding access here is a request a second Super Admin approves; removing access is done at once.</p>
        )}
        {caller.userId === person.userId && <p className="text-xs text-slate-500">This is you: nobody changes their own access. You may sign yourself out everywhere.</p>}
      </section>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>
      )}
      {link && <LinkBox path={link} who={person.name} />}

      <Roles assignments={assignments} plans={can.roles} busy={busy} change={change} />
      {can.grant && <GrantForm plan={can.grant} grantable={caller.grantable} busy={busy} change={change} />}
      <AccountActions person={person} can={can} busy={busy} change={change} />

      <section aria-label="Requests about this person" className={card}>
        <h2 className="font-serif text-lg font-bold">Requests (last 30 days)</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">No requests about this person.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={r.id}>
                {describeRequest(r)} <span className="text-slate-500">· asked by {r.requestedByName ?? "a Super Admin"} · {r.outcome ? `${OUTCOME_LABEL[r.outcome]} by ${r.decidedByName ?? "—"}` : r.lapsed ? "lapsed" : "waiting"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history && (
        <section aria-label="History" className={card}>
          <h2 className="font-serif text-lg font-bold">History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing recorded in the app yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  <span className="font-semibold">{h.action}</span> {h.outcome === "failed" ? "(failed) " : ""}
                  <span className="text-slate-500">· {h.actor_label} · {when(h.at)}{h.reason ? ` · ${h.reason}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

type Change = (path: string, body: Record<string, unknown>, done: string) => Promise<boolean>;

function Roles({ assignments, plans, busy, change }: { assignments: RoleView[]; plans: Detail["can"]["roles"]; busy: boolean; change: Change }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, number>>({});
  return (
    <section aria-label="Roles" className={card}>
      <h2 className="font-serif text-lg font-bold">Roles</h2>
      {assignments.length === 0 ? (
        <p className="text-sm text-slate-500">No roles yet.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((r) => {
            const plan = plans[r.id];
            const reason = reasons[r.id] ?? "";
            return (
              <li key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2b2f36]">
                <p>
                  <span className="font-semibold">{roleLabel(r.role)}</span> · {deskLabel(r)}
                  {r.isBreakGlass && <span className="ml-2 font-bold text-amber-700 dark:text-amber-300">Emergency access</span>}
                  <span className="ml-2 text-xs text-slate-500">{STATE_LABEL[r.state]}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Granted {day(r.grantedAt)} by {r.grantedByName ?? (r.grantedBy ? "staff" : "the owner")}
                  {r.approvedByName ? `, approved by ${r.approvedByName}` : ""} ·{" "}
                  {r.revokedAt ? `revoked ${day(r.revokedAt)}${r.revokeReason ? ` (${r.revokeReason})` : ""}` : `until ${day(r.expiresAt)}`}
                </p>
                {plan && (plan.renew || plan.revoke) && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold">
                      Reason
                      <input className={field} value={reason} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
                    </label>
                    {plan.renew && (
                      <>
                        <label className="text-xs font-semibold">
                          For
                          <select className={field} value={days[r.id] ?? defaultDays(r.role)} onChange={(e) => setDays({ ...days, [r.id]: Number(e.target.value) })}>
                            {EXPIRY_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
                          </select>
                        </label>
                        <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void change(`/roles/${r.id}/renew`, { days: days[r.id] ?? defaultDays(r.role), reason }, "Renewed.")}>
                          {verb(plan.renew, "Renew")}
                        </button>
                      </>
                    )}
                    {plan.revoke && (
                      <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void change(`/roles/${r.id}/revoke`, { reason }, "Revoked: it applies to their next request.")}>
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GrantForm({ plan, grantable, busy, change }: { plan: Plan; grantable: string[]; busy: boolean; change: Change }) {
  const [role, setRole] = useState(grantable[grantable.length - 1] ?? "");
  const [language, setLanguage] = useState("hi");
  const [section, setSection] = useState("");
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [reason, setReason] = useState("");
  const pickRole = (r: string) => {
    setRole(r);
    setDays(defaultDays(r));
  };
  const submit = async () => {
    const ok = await change("/roles", { role, language: language || null, section: section || null, days, reason }, "Granted.");
    if (ok) setReason("");
  };
  return (
    <section aria-label="Grant a role" className={card}>
      <h2 className="font-serif text-lg font-bold">Grant a role</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <label className="text-sm font-semibold">
          Reason
          <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <button type="button" className={button} disabled={busy || !role || !reason.trim()} onClick={() => void submit()}>
        {verb(plan, "Grant")}
      </button>
    </section>
  );
}

function AccountActions({ person, can, busy, change }: { person: PersonView; can: Detail["can"]; busy: boolean; change: Change }) {
  const [name, setName] = useState(person.name);
  const [renameReason, setRenameReason] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [resetReason, setResetReason] = useState("");
  const statusPlan = person.status === "active" ? can.suspend : can.reactivate;
  if (!can.rename && !statusPlan && !can.signOut && !can.passwordLink && !can.mfaReset) return null;
  return (
    <section aria-label="Account actions" className={card}>
      <h2 className="font-serif text-lg font-bold">Account</h2>
      {can.rename && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            Display name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            Reason for the new name
            <input className={field} value={renameReason} onChange={(e) => setRenameReason(e.target.value)} />
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !name.trim() || name.trim() === person.name || !renameReason.trim()}
            onClick={() => void change("", { display_name: name.trim(), reason: renameReason }, "Renamed.")}
          >
            {verb(can.rename, "Rename")}
          </button>
        </div>
      )}
      {statusPlan && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            {person.status === "active" ? "Reason to suspend" : "Reason to reactivate"}
            <input className={field} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
          </label>
          {person.status === "active" ? (
            <button type="button" className={button} disabled={busy || !statusReason.trim()} onClick={() => void change("/suspend", { reason: statusReason }, "Suspended, and signed out everywhere.")}>
              Suspend
            </button>
          ) : (
            <button type="button" className={button} disabled={busy || !statusReason.trim()} onClick={() => void change("/reactivate", { reason: statusReason }, "Reactivated.")}>
              {verb(statusPlan, "Reactivate")}
            </button>
          )}
        </div>
      )}
      {can.signOut && (
        <div>
          <button type="button" className={button} disabled={busy} onClick={() => void change("/sign-out", {}, "Signed out everywhere: they sign in again, with their second factor.")}>
            Sign out everywhere
          </button>
        </div>
      )}
      {can.passwordLink && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            Reason for a password link
            <input className={field} value={linkReason} onChange={(e) => setLinkReason(e.target.value)} />
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !linkReason.trim()}
            onClick={() => void change("/password-link", { reason: linkReason }, "A one-time link is ready below.").then((ok) => ok && setLinkReason(""))}
          >
            {can.passwordLink === "ask" ? "Ask for a password link" : "Make a password link"}
          </button>
        </div>
      )}
      {can.mfaReset && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold">
            How did you check it is them? (lost device)
            <input className={field} value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !resetReason.trim()}
            onClick={() => void change("/mfa-reset", { reason: resetReason }, "Asked.").then((ok) => ok && setResetReason(""))}
          >
            Ask to reset the second factor
          </button>
        </div>
      )}
    </section>
  );
}
