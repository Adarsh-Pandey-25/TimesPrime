"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Gavel, MessageSquarePlus, UserCheck } from "lucide-react";
import { CORRECTION_KIND_LABELS, isCorrectionKind } from "@timesprime/shared/config/corrections";
import { GRIEVANCE_LIMITS, GRIEVANCE_OUTCOMES, type GrievanceOutcome } from "@timesprime/shared/config/grievances";
import { deskCall, STATE_LABELS, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { backLink, badge, button, buttonPrimary, card, cardTitle, field, hint, item, label, link, panel, panelTitle, tone } from "../ui/styles";
import { categoryLabel, channelLabel, clockBadge, nameOf, outcomeLabel, type Grievance } from "./grievanceClient";

// One grievance (Panel 7 design §4): what was sent, its clocks, the story it is about, the notes, and
// for the Grievance Officer and Legal the actions: acknowledge one typed in, take it, add a note,
// decide. A decision is final (the database refuses any change after it), so it is confirmed first.

interface Note {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}

interface Detail {
  grievance: Grievance;
  notes: Note[];
  story: { id: string; workflow_state: keyof typeof STATE_LABELS; headline: string | null } | null;
  /** The corrections it caused (M2), published on the Desk with this grievance's ticket. */
  corrections?: Array<{ id: string; story_id: string; kind: string; text: string; headline: string | null; published_at: string }>;
  may_handle: boolean;
  yours: boolean;
}

export default function GrievanceDetail({ id }: { id: string }) {
  const dialog = useDialog();
  const [data, setData] = useState<Detail | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<GrievanceOutcome>("upheld");
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    const res = await deskCall<Detail>(`/api/admin/compliance/grievances/${id}`);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadedAt(Date.now());
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the grievance.");
    }
  }, [id]);

  // Necessary setState-in-effect: the grievance comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(path: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true);
    const res = await deskCall(`/api/admin/compliance/grievances/${id}/${path}`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: res.error ?? "Not done." });
    if (res.ok) await load();
    return res.ok;
  }

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act("notes", { body: note }, "The note is added.")) setNote("");
  };

  const decide = async (e: React.FormEvent) => {
    e.preventDefault();
    const sure = await dialog.confirm({
      title: "Decide this grievance?",
      message: `Outcome: ${outcomeLabel(outcome)}. A decision is final: it cannot be changed afterwards. The reply shows on the complainant's status page; email it to them too.`,
      confirmLabel: "Decide",
    });
    if (sure) await act("decide", { outcome, reply }, "The grievance is decided.");
  };

  const back = (
    <Link href="/admin/compliance" className={backLink}>
      ← Compliance
    </Link>
  );
  if (loadError) {
    return (
      <div className="space-y-4">
        {back}
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" onClick={load} className={link}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (!data) return <p role="status" className={hint}>Loading the grievance…</p>;

  const g = data.grievance;
  const open = g.state === "open";
  const clock = clockBadge(g, loadedAt);
  const handler = nameOf(g, g.assigned_to);
  const canAcknowledge = data.may_handle && open && !g.acknowledged_at;

  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-2xl font-extrabold">{g.ticket}</h1>
        <span className={`${badge} ${clock.className}`}>{clock.text}</span>
        <span className={`${badge} ${tone.slate}`}>{categoryLabel(g.category)}</span>
      </header>
      <ActionMessage message={message} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section aria-labelledby="sent-title" className={`${card} space-y-3`}>
            <h2 id="sent-title" className={cardTitle}>
              What was sent
            </h2>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="font-semibold">From</dt>
              <dd>{g.name}</dd>
              <dt className="font-semibold">Email</dt>
              <dd>
                {g.contact_shown ? (
                  <a href={`mailto:${g.email}?subject=${encodeURIComponent(`Your grievance ${g.ticket}`)}`} className={link}>
                    {g.email}
                  </a>
                ) : (
                  <span>
                    {g.email} <span className={hint}>(masked: only the Grievance Officer and Legal see it)</span>
                  </span>
                )}
              </dd>
              <dt className="font-semibold">Arrived</dt>
              <dd>
                {when(g.received_at)} · {channelLabel(g.channel)} · {g.language === "hi" ? "Hindi" : "English"}
              </dd>
              <dt className="font-semibold">About</dt>
              <dd className="break-words">
                {g.about_url ?? <span className={hint}>No address given</span>}
                {data.story && (
                  <span className="block">
                    <Link href={`/admin/desk/${data.story.id}`} className={link}>
                      {data.story.headline ?? "The Desk story"}
                    </Link>{" "}
                    <span className={hint}>({STATE_LABELS[data.story.workflow_state] ?? data.story.workflow_state})</span>
                  </span>
                )}
              </dd>
            </dl>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-[#25282d]" lang={g.language}>
              {g.body}
            </p>
          </section>

          {g.state === "decided" && g.outcome && (
            <section aria-labelledby="decision-title" className={`${card} space-y-2`}>
              <h2 id="decision-title" className={`${cardTitle} flex items-center gap-2`}>
                <Gavel aria-hidden="true" className="h-5 w-5" />
                The decision: {outcomeLabel(g.outcome)}
              </h2>
              <p className={hint}>
                By {nameOf(g, g.decided_by)}, {when(g.decided_at)}. Shown on the complainant&apos;s status page.
              </p>
              <p className="whitespace-pre-wrap text-sm" lang={g.language}>
                {g.reply}
              </p>
            </section>
          )}

          {data.corrections && data.corrections.length > 0 && (
            <section aria-labelledby="corrections-title" className={`${card} space-y-2`}>
              <h2 id="corrections-title" className={cardTitle}>
                Corrections it caused
              </h2>
              <ol className="space-y-2">
                {data.corrections.map((c) => (
                  <li key={c.id} className={`${item} space-y-1`}>
                    <p className={hint}>
                      {isCorrectionKind(c.kind) ? CORRECTION_KIND_LABELS[c.kind].en : c.kind}, {when(c.published_at)} ·{" "}
                      <Link href={`/admin/desk/${c.story_id}`} className={link}>
                        {c.headline ?? "The Desk story"}
                      </Link>
                    </p>
                    <p className="text-sm">{c.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="notes-title" className={`${card} space-y-3`}>
            <h2 id="notes-title" className={cardTitle}>
              Notes
            </h2>
            <p className={hint}>Internal: never shown to the complainant. A note cannot be changed once added.</p>
            {data.notes.length === 0 && <p className={hint}>No notes yet.</p>}
            {data.notes.length > 0 && (
              <ol aria-label="Notes, oldest first" className="space-y-2">
                {data.notes.map((n) => (
                  <li key={n.id} className={`${item} space-y-1`}>
                    <p className={hint}>
                      {n.author_name}, {when(n.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {data.may_handle && (
              <form onSubmit={addNote} className="space-y-2">
                <label className={label}>
                  A note
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={GRIEVANCE_LIMITS.note} rows={3} required className={`${field} mt-1`} />
                </label>
                <div className="flex justify-end">
                  <button type="submit" disabled={busy || !note.trim()} className={button}>
                    <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
                    Add the note
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby="clocks-title" className={panel}>
            <h2 id="clocks-title" className={panelTitle}>
              Clocks
            </h2>
            <p className="text-sm">
              Acknowledge by {when(g.ack_due_at)}:{" "}
              {g.acknowledged_at ? (
                <span className="font-semibold">
                  done {when(g.acknowledged_at)}
                  {g.channel === "web" ? " (by the form)" : g.acknowledged_by ? ` by ${nameOf(g, g.acknowledged_by)}` : ""}
                </span>
              ) : (
                <span className="font-semibold text-red-700 dark:text-red-300">not yet</span>
              )}
            </p>
            <p className="text-sm">Decide by {when(g.decide_due_at)}</p>
            {canAcknowledge && (
              <button type="button" disabled={busy} onClick={() => act("acknowledge", {}, "Marked as acknowledged.")} className={button}>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />I have acknowledged it
              </button>
            )}
          </section>

          <section aria-labelledby="handler-title" className={panel}>
            <h2 id="handler-title" className={panelTitle}>
              Who handles it
            </h2>
            <p className="text-sm">{handler ?? "Nobody has taken it yet."}</p>
            {data.may_handle && open && !data.yours && (
              <button type="button" disabled={busy} onClick={() => act("assign", {}, "You handle this grievance now.")} className={button}>
                <UserCheck aria-hidden="true" className="h-4 w-4" />
                {handler ? "Take it over" : "I'll handle this"}
              </button>
            )}
          </section>

          {data.may_handle && open && (
            <form onSubmit={decide} aria-labelledby="decide-title" className={panel}>
              <h2 id="decide-title" className={panelTitle}>
                Decide
              </h2>
              <label className={label}>
                Outcome
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as GrievanceOutcome)} className={`${field} mt-1`}>
                  {GRIEVANCE_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {outcomeLabel(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                The reply to the complainant
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={GRIEVANCE_LIMITS.reply} rows={6} required className={`${field} mt-1`} />
              </label>
              <p className={hint}>It shows on their status page. Email it to them as well, from the grievance address.</p>
              <button type="submit" disabled={busy || !reply.trim()} className={buttonPrimary}>
                <Gavel aria-hidden="true" className="h-4 w-4" />
                Decide
              </button>
            </form>
          )}
          {!data.may_handle && <p className={hint}>You can read grievances. The Grievance Officer and Legal act on them.</p>}
        </aside>
      </div>
    </div>
  );
}
