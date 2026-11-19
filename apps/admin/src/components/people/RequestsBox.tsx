"use client";

import { useState, type ReactNode } from "react";
import { deskCall, when } from "../desk/deskClient";
import LinkBox from "./LinkBox";
import { describeRequest, type RequestView } from "./peopleClient";
import { button } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// A Super Admin's requests (Panel 1 design §3 and §4): those waiting for the caller's decision, and
// those the caller made. Approve and Decline are offered only where the API says the caller may
// decide (another Super Admin, not the person it is about, before it lapses); Cancel only on one's
// own. The server decides each.

export default function RequestsBox({ requests, onChanged }: { requests: RequestView[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Approving an addition or a password link gives a one-time link: shown once, to hand over (M2).
  const [link, setLink] = useState<{ path: string; who: string | null } | null>(null);

  const open = requests.filter((r) => r.outcome === null);
  const waiting = open.filter((r) => r.canDecide);
  const mine = open.filter((r) => r.mine);

  async function decide(r: RequestView, step: "approve" | "decline" | "cancel") {
    setBusy(r.id);
    setLink(null);
    const note = notes[r.id]?.trim();
    const res = await deskCall<{ link?: string }>(`/api/admin/people/requests/${r.id}/${step}`, { method: "POST", body: JSON.stringify(note ? { note } : {}) });
    setBusy(null);
    const done = step === "approve" ? "Approved: the change is made." : step === "decline" ? "Declined: nothing changed." : "Cancelled.";
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: res.error ?? "Not done." });
    if (res.ok && res.data?.link) setLink({ path: res.data.link, who: r.userName });
    if (res.ok) onChanged();
  }

  const item = (r: RequestView, actions: ReactNode) => (
    <li key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2b2f36]">
      <p className="font-semibold">{describeRequest(r)}</p>
      <p className="text-slate-600 dark:text-slate-300">Reason: {r.reason}</p>
      <p className="text-xs text-slate-500">
        Asked by {r.requestedByName ?? "a Super Admin"} · {when(r.requestedAt)} · {r.lapsed ? "lapsed: ask again" : `lapses ${when(r.lapsesAt)}`}
      </p>
      {actions}
    </li>
  );

  return (
    <section aria-label="Requests" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2b2f36] dark:bg-[#202327]">
      <div>
        <h2 className="font-serif text-lg font-bold">Waiting for your approval</h2>
        <p className="text-xs text-slate-500">A Super Admin&apos;s change takes a second Super Admin. You cannot decide your own request, or one about you.</p>
      </div>
      <ActionMessage message={message} />
      {link && <LinkBox path={link.path} who={link.who} />}
      {waiting.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing is waiting for you.</p>
      ) : (
        <ul className="space-y-2">
          {waiting.map((r) =>
            item(
              r,
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold">
                  Note (optional)
                  <input
                    className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                </label>
                <button type="button" className={button} disabled={busy === r.id} onClick={() => void decide(r, "approve")}>Approve</button>
                <button type="button" className={button} disabled={busy === r.id} onClick={() => void decide(r, "decline")}>Decline</button>
              </div>
            )
          )}
        </ul>
      )}
      {mine.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Your requests</h3>
          <ul className="space-y-2">
            {mine.map((r) =>
              item(
                r,
                r.canCancel && (
                  <button type="button" className={button} disabled={busy === r.id} onClick={() => void decide(r, "cancel")}>Cancel</button>
                )
              )
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
