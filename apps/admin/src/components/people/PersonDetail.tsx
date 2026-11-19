"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import {
  backLink,
  badge,
  button,
  buttonDanger,
  buttonPrimary,
  card,
  cardTitle,
  field as baseField,
  hint,
  item,
  label,
  pageTitle,
  tone,
} from "../ui/styles";
import ActionMessage, { type Message } from "../ui/ActionMessage";

// One staff member (Panel 1 design §4): their account, every role they hold or held, the requests
// about them, and what was done to them (for holders of audit.read). The actions shown are the ones
// the API says the caller may take (`can`): "act" does it at once, "ask" makes a request a second
// Super Admin decides. Every change carries a reason. The server decides each request.
//
// In the order a visit needs it (the owner, 19 Nov 2026): who they are; a request about them still
// open; their roles, with granting one; the account's actions, those that take access away last and
// in red; then the past (requests decided, the history). An action's answer shows in its own card.

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

/** Which card an answer belongs to, so it shows beside the button that asked. */
type Area = "roles" | "account";
type Answer = Message & { area: Area };

const field = `mt-1 ${baseField}`;
const STATE_LABEL: Record<RoleView["state"], string> = { live: "Live", expired: "Expired", revoked: "Revoked" };
const STATE_TONE: Record<RoleView["state"], string> = { live: tone.green, expired: tone.slate, revoked: tone.red };
const OUTCOME_LABEL: Record<string, string> = { approved: "Approved", declined: "Declined", cancelled: "Cancelled" };

/** A button's words for a plan: "Rename" at once, "Ask to rename" for a request. */
const verb = (plan: Plan, word: string) => (plan === "ask" ? `Ask to ${word.toLowerCase()}` : word);

export default function PersonDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
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

  /** One change: its answer shows in the card it came from, and the page reloads. */
  async function change(area: Area, path: string, body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setLink(null);
    const res = await deskCall<{ link?: string }>(`/api/admin/people/${id}${path}`, { method: path ? "POST" : "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    setAnswer(res.ok ? { area, ok: true, text: doneOrAsked(res.status, done) } : { area, ok: false, text: res.error ?? "Not done." });
    if (res.ok && res.data?.link) setLink(res.data.link);
    if (res.ok) await load();
    return res.ok;
  }

  const back = (
    <Link href="/admin/people" className={backLink}>
      ← All people
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</p>
        {back}
      </div>
    );
  }
  if (!detail) return <p aria-live="polite" className="text-sm text-slate-500">Loading…</p>;

  const { person, assignments, requests, history, can, caller } = detail;
  const answerFor = (area: Area) => (answer?.area === area ? answer : null);
  const open = requests.some((r) => r.outcome === null && !r.lapsed);

  const requestsCard = (
    <section aria-label="Requests about this person" className={`${card} ${open ? "border-amber-300 dark:border-amber-800" : ""}`}>
      <h2 className={cardTitle}>{open ? "Requests: waiting for a decision" : "Requests (last 30 days)"}</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-slate-500">No requests about this person.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {requests.map((r) => {
            const waiting = r.outcome === null && !r.lapsed;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className={`${badge} ${waiting ? tone.amber : r.outcome === "approved" ? tone.green : tone.slate}`}>
                  {r.outcome ? OUTCOME_LABEL[r.outcome] : r.lapsed ? "Lapsed" : "Waiting"}
                </span>
                <span>{describeRequest(r)}</span>
                <span className={hint}>
                  · asked by {r.requestedByName ?? "a Super Admin"}
                  {r.outcome ? ` · ${OUTCOME_LABEL[r.outcome].toLowerCase()} by ${r.decidedByName ?? "—"}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {back}

      {/* 1. Who they are. */}
      <section aria-label="Account" className={card}>
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
            {person.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h1 className={pageTitle}>{person.name}</h1>
            <span className={`${badge} ${person.status === "active" ? tone.green : tone.red}`}>{person.status === "active" ? "Active" : "Suspended"}</span>
          </div>
        </div>
        <dl className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:bg-[#25282d]">
          <div><dt className={hint}>Email</dt><dd className="break-all font-semibold">{person.email ?? "—"}</dd></div>
          <div>
            <dt className={hint}>Second factor</dt>
            <dd>
              {person.hasFactor === null ? "—" : <span className={`${badge} ${person.hasFactor ? tone.green : tone.amber}`}>{person.hasFactor ? "Set" : "Not set yet"}</span>}
            </dd>
          </div>
          <div><dt className={hint}>Last sign-in</dt><dd className="font-semibold">{person.lastSignInAt ? when(person.lastSignInAt) : "Not signed in yet"}</dd></div>
          <div><dt className={hint}>Staff since</dt><dd className="font-semibold">{day(person.createdAt)}</dd></div>
        </dl>
        {caller.asks && <p className={hint}>Adding access here is a request a second Super Admin approves; removing access is done at once.</p>}
        {caller.userId === person.userId && <p className={hint}>This is you: nobody changes their own access. You may sign yourself out everywhere.</p>}
      </section>

      {/* 2. A request about them still open: it needs a decision before anything else. */}
      {open && requestsCard}

      {/* 3. Their roles, and granting one. */}
      <Roles
        assignments={assignments}
        plans={can.roles}
        busy={busy}
        change={(...a) => change("roles", ...a)}
        answer={answerFor("roles")}
        grant={can.grant ? <GrantForm plan={can.grant} grantable={caller.grantable} busy={busy} change={(...a) => change("roles", ...a)} /> : null}
      />

      {/* 4. The account's actions; those that take access away last, in red. */}
      <AccountActions person={person} can={can} busy={busy} change={(...a) => change("account", ...a)} answer={answerFor("account")} link={link} />

      {/* 5. The past. */}
      {!open && requestsCard}
      {history && (
        <section aria-label="History" className={card}>
          <h2 className={cardTitle}>History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing recorded in the app yet.</p>
          ) : (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm dark:border-[#2b2f36]">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400 dark:border-[#202327]" />
                  <span className="font-mono text-xs font-semibold">{h.action}</span> {h.outcome === "failed" ? <span className={`${badge} ${tone.red}`}>failed</span> : null}
                  <span className={`${hint} block`}>{h.actor_label} · {when(h.at)}{h.reason ? ` · ${h.reason}` : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

type Change = (path: string, body: Record<string, unknown>, done: string) => Promise<boolean>;

function Roles({
  assignments,
  plans,
  busy,
  change,
  answer,
  grant,
}: {
  assignments: RoleView[];
  plans: Detail["can"]["roles"];
  busy: boolean;
  change: Change;
  answer: Message | null;
  grant: ReactNode;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, number>>({});
  const live = assignments.filter((r) => r.state === "live").length;
  return (
    <section aria-label="Roles" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cardTitle}>Roles</h2>
        <span className={hint}>{live} live</span>
      </div>
      <ActionMessage message={answer} />
      {assignments.length === 0 ? (
        <p className="text-sm text-slate-500">No roles yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((r) => {
            const plan = plans[r.id];
            const reason = reasons[r.id] ?? "";
            return (
              <li key={r.id} className={`${item} space-y-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{roleLabel(r.role)}</span>
                  <span className="text-slate-600 dark:text-slate-300">· {deskLabel(r)}</span>
                  <span className={`${badge} ${STATE_TONE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  {r.isBreakGlass && <span className={`${badge} ${tone.red}`}>Emergency access</span>}
                </div>
                <p className={hint}>
                  Granted {day(r.grantedAt)} by {r.grantedByName ?? (r.grantedBy ? "staff" : "the owner")}
                  {r.approvedByName ? `, approved by ${r.approvedByName}` : ""} ·{" "}
                  {r.revokedAt ? `revoked ${day(r.revokedAt)}${r.revokeReason ? ` (${r.revokeReason})` : ""}` : `until ${day(r.expiresAt)}`}
                </p>
                {plan && (plan.renew || plan.revoke) && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2 dark:border-[#2b2f36]">
                    <label className={`${label} min-w-[12rem] flex-1 text-xs`}>
                      Reason
                      <input className={field} value={reason} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
                    </label>
                    {plan.renew && (
                      <>
                        <label className={`${label} text-xs`}>
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
                      <button type="button" className={buttonDanger} disabled={busy || !reason.trim()} onClick={() => void change(`/roles/${r.id}/revoke`, { reason }, "Revoked: it applies to their next request.")}>
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
      {grant}
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
    <section aria-label="Grant a role" className="space-y-3 border-t border-slate-200 pt-4 dark:border-[#2b2f36]">
      <h3 className="text-sm font-bold">Grant a role</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${label} min-w-[14rem] flex-1`}>
          Reason
          <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="button" className={buttonPrimary} disabled={busy || !role || !reason.trim()} onClick={() => void submit()}>
          {verb(plan, "Grant")}
        </button>
      </div>
    </section>
  );
}

/** One action of the account: its field (whose label says what it is for) and its button, in a row. */
function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2 py-3 first:pt-0 last:pb-0">{children}</div>;
}

function AccountActions({
  person,
  can,
  busy,
  change,
  answer,
  link,
}: {
  person: PersonView;
  can: Detail["can"];
  busy: boolean;
  change: Change;
  answer: Message | null;
  link: string | null;
}) {
  const [name, setName] = useState(person.name);
  const [renameReason, setRenameReason] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [resetReason, setResetReason] = useState("");
  const active = person.status === "active";
  const statusPlan = active ? can.suspend : can.reactivate;
  if (!can.rename && !statusPlan && !can.signOut && !can.passwordLink && !can.mfaReset) return null;

  const statusField = (
    <label className={`${label} min-w-[14rem] flex-1`}>
      {active ? "Reason to suspend" : "Reason to reactivate"}
      <input className={field} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
    </label>
  );
  const takesAway = can.signOut || (active && can.suspend) || can.mfaReset;

  return (
    <section aria-label="Account actions" className={card}>
      <h2 className={cardTitle}>Manage account</h2>
      <ActionMessage message={answer} />
      {link && <LinkBox path={link} who={person.name} />}

      {(can.rename || can.passwordLink || (!active && can.reactivate)) && (
        <div className="divide-y divide-slate-100 dark:divide-[#2b2f36]">
          {can.rename && (
            <Row>
              <label className={`${label} min-w-[12rem] flex-1`}>
                Display name
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className={`${label} min-w-[12rem] flex-1`}>
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
            </Row>
          )}
          {can.passwordLink && (
            <Row>
              <label className={`${label} min-w-[14rem] flex-1`}>
                Reason for a password link
                <input className={field} value={linkReason} onChange={(e) => setLinkReason(e.target.value)} />
              </label>
              <button
                type="button"
                className={button}
                disabled={busy || !linkReason.trim()}
                onClick={() => void change("/password-link", { reason: linkReason }, "A one-time link is ready above.").then((ok) => ok && setLinkReason(""))}
              >
                {can.passwordLink === "ask" ? "Ask for a password link" : "Make a password link"}
              </button>
            </Row>
          )}
          {!active && can.reactivate && (
            <Row>
              {statusField}
              <button type="button" className={buttonPrimary} disabled={busy || !statusReason.trim()} onClick={() => void change("/reactivate", { reason: statusReason }, "Reactivated.")}>
                {verb(can.reactivate, "Reactivate")}
              </button>
            </Row>
          )}
        </div>
      )}

      {takesAway && (
        <div className="space-y-1 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-red-950/20">
          <h3 className="text-sm font-bold text-red-800 dark:text-red-200">Take access away</h3>
          <p className={hint}>Done at once, by one person: each applies to their next click.</p>
          <div className="divide-y divide-red-100 dark:divide-red-900/40">
            {can.signOut && (
              <Row>
                <p className="min-w-[14rem] flex-1 text-sm text-slate-600 dark:text-slate-300">End every session: they sign in again, with their second factor.</p>
                <button type="button" className={button} disabled={busy} onClick={() => void change("/sign-out", {}, "Signed out everywhere: they sign in again, with their second factor.")}>
                  Sign out everywhere
                </button>
              </Row>
            )}
            {active && can.suspend && (
              <Row>
                {statusField}
                <button type="button" className={buttonDanger} disabled={busy || !statusReason.trim()} onClick={() => void change("/suspend", { reason: statusReason }, "Suspended, and signed out everywhere.")}>
                  Suspend
                </button>
              </Row>
            )}
            {can.mfaReset && (
              <Row>
                <label className={`${label} min-w-[14rem] flex-1`}>
                  How did you check it is them? (lost device)
                  <input className={field} value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
                </label>
                <button
                  type="button"
                  className={buttonDanger}
                  disabled={busy || !resetReason.trim()}
                  onClick={() => void change("/mfa-reset", { reason: resetReason }, "Asked.").then((ok) => ok && setResetReason(""))}
                >
                  Ask to reset the second factor
                </button>
              </Row>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
