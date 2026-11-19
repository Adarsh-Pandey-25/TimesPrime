"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { defaultDays, REVIEW_EVERY_DAYS, STALE_SIGN_IN_DAYS } from "@timesprime/shared/config/people";
import { deskCall, when } from "../desk/deskClient";
import { day, deskLabel, roleLabel } from "./peopleClient";
import { button } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// The access review (Panel 1 design §6, M3b): every 90 days a Super Admin goes through every live
// assignment, and every expired one never revoked, with what needs a look flagged. Each row is kept,
// revoked (at once) or renewed (a Super Admin's renewal is a request a second Super Admin decides),
// through the same routes as on a person's page. Completing the review records the decisions and a
// note; the server reads the rows itself at that moment. The server decides each request.

interface Item {
  assignmentId: string;
  userId: string;
  name: string;
  email: string | null;
  status: "active" | "suspended";
  role: string;
  language: string | null;
  section: string | null;
  grantedByName: string | null;
  grantedAt: string;
  expiresAt: string;
  lastSignInAt: string | null;
  flags: { stale: boolean; noFactor: boolean | null; privileged: boolean; expired: boolean };
}

interface Review {
  items: Item[];
  due: { lastAt: string | null; dueAt: string; overdue: boolean };
  accounts: boolean;
}

type Decision = "keep" | "revoked" | "renew_asked" | "renewed";

const flag = "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
const DECIDED: Record<Exclude<Decision, "keep">, string> = { revoked: "Revoked", renew_asked: "Renewal asked", renewed: "Renewed" };

export default function AccessReview() {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await deskCall<Review>("/api/admin/people/review");
    if (!res.ok || !res.data) return setError(res.error ?? "Could not load the review.");
    setError("");
    setReview(res.data);
  }, []);

  // Necessary setState-in-effect: the review comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(item: Item, step: "revoke" | "renew") {
    setBusy(item.assignmentId);
    const reason = (reasons[item.assignmentId] ?? "").trim() || "Access review";
    const body = step === "revoke" ? { reason } : { reason, days: defaultDays(item.role) };
    const res = await deskCall(`/api/admin/people/${item.userId}/roles/${item.assignmentId}/${step}`, { method: "POST", body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) return setMessage({ ok: false, text: `${item.name}, ${roleLabel(item.role)}: ${res.error ?? "not done."}` });
    const decision: Decision = step === "revoke" ? "revoked" : res.status === 202 ? "renew_asked" : "renewed";
    setDecisions((d) => ({ ...d, [item.assignmentId]: decision }));
    setMessage({ ok: true, text: `${item.name}, ${roleLabel(item.role)}: ${DECIDED[decision as Exclude<Decision, "keep">].toLowerCase()}.` });
  }

  async function complete() {
    setBusy("complete");
    const res = await deskCall<{ review: { completed_at: string } }>("/api/admin/people/review", { method: "POST", body: JSON.stringify({ note, decisions }) });
    setBusy(null);
    if (!res.ok || !res.data) return setMessage({ ok: false, text: res.error ?? "The review was not recorded." });
    const at = res.data.review.completed_at;
    setMessage({ ok: true, text: `The review is recorded (${when(at)}). The next one is due in ${REVIEW_EVERY_DAYS} days.` });
    setDecisions({});
    setNote("");
    await load();
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</p>
        <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      </div>
    );
  }
  if (!review) return <p aria-live="polite" className="text-sm text-slate-500">Loading the review…</p>;

  const flagged = review.items.filter((i) => i.flags.stale || i.flags.noFactor || i.flags.privileged || i.flags.expired).length;
  return (
    <div className="space-y-6">
      <Link href="/admin/people" className="text-sm font-semibold text-blue-700 dark:text-blue-300">← All people</Link>
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-extrabold">Access review</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {review.due.lastAt ? `Last review: ${day(review.due.lastAt)}. ` : "No review yet. "}
          {review.due.overdue ? "A review is due now." : `Next due: ${day(review.due.dueAt)}.`} Every {REVIEW_EVERY_DAYS} days, go through every role: keep it, revoke it, or renew it.
        </p>
        <p className="text-sm">
          {review.items.length} roles, {flagged} flagged.
          {!review.accounts && <span className="ml-2 text-amber-700 dark:text-amber-300">Second factors could not be read from Supabase Auth just now.</span>}
        </p>
      </div>

      <ActionMessage message={message} />

      {review.items.length === 0 ? (
        <p className="text-sm text-slate-500">No roles to review.</p>
      ) : (
        <ul aria-label="Roles to review" className="space-y-3">
          {review.items.map((i) => {
            const decided = decisions[i.assignmentId];
            return (
              <li key={i.assignmentId} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-[#2b2f36] dark:bg-[#202327]">
                <p>
                  <Link href={`/admin/people/${i.userId}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{i.name}</Link>{" "}
                  · {roleLabel(i.role)} · {deskLabel(i)} {i.status === "suspended" && <span className="font-bold text-red-700 dark:text-red-300">· Suspended</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Granted {day(i.grantedAt)}{i.grantedByName ? ` by ${i.grantedByName}` : ""} · {i.flags.expired ? `expired ${day(i.expiresAt)}` : `until ${day(i.expiresAt)}`} · last
                  sign-in {i.lastSignInAt ? when(i.lastSignInAt) : "never"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {i.flags.stale && <span className={flag}>No sign-in for {STALE_SIGN_IN_DAYS} days</span>}
                  {i.flags.noFactor && <span className={flag}>No second factor</span>}
                  {i.flags.privileged && <span className={flag}>Privileged role</span>}
                  {i.flags.expired && <span className={flag}>Expired, not revoked</span>}
                </div>
                {decided ? (
                  <p className="font-semibold">{DECIDED[decided as Exclude<Decision, "keep">]}</p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold">
                      Reason
                      <input
                        className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]"
                        placeholder="Access review"
                        value={reasons[i.assignmentId] ?? ""}
                        onChange={(e) => setReasons({ ...reasons, [i.assignmentId]: e.target.value })}
                      />
                    </label>
                    <button type="button" className={button} disabled={busy !== null} onClick={() => void act(i, "renew")}>Renew</button>
                    <button type="button" className={button} disabled={busy !== null} onClick={() => void act(i, "revoke")}>Revoke</button>
                    <span className="text-xs text-slate-500">Leave it as it is to keep it.</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section aria-label="Complete the review" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2b2f36] dark:bg-[#202327]">
        <label className="block text-sm font-semibold">
          Note (what you checked, anything to follow up)
          <textarea className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className={button} disabled={busy !== null} onClick={() => void complete()}>Complete the review</button>
        <p className="text-xs text-slate-500">The record keeps who, when, the note and every role with its decision. It cannot be changed afterwards.</p>
      </section>
    </div>
  );
}
