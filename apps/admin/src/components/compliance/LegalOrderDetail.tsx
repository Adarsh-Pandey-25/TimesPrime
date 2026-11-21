"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AUTHORITY_TYPE_LABELS,
  LEGAL_ORDER_LIMITS,
  ORDER_ASK_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  RECEIVED_VIA_LABELS,
  type OrderStatus,
} from "@timesprime/shared/config/legalOrders";
import { deskCall, STATE_LABELS, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { backLink, badge, button, buttonPrimary, card, cardTitle, field, hint, item, label, link, panel, panelTitle } from "../ui/styles";
import { clockBadge, statusTone, type OrderSummary } from "./LegalOrders";

// One legal order (Panel 7 design §4, M4): what it is, the stories it names, what was done; and for
// Legal, its state, deadline and where the original is kept, and a new action. Closing is confirmed:
// a closed order is final (the database refuses any change after it); actions can still be added.

interface Detail {
  order: OrderSummary & {
    order_date: string | null;
    received_via: keyof typeof RECEIVED_VIA_LABELS;
    summary: string;
    original_kept_at: string;
    created_at: string;
    created_by_name: string;
    updated_at: string | null;
    updated_by_name: string | null;
  };
  actions: Array<{ id: string; body: string; author_name: string; created_at: string }>;
  stories: Array<{ id: string; workflow_state: keyof typeof STATE_LABELS; headline: string | null }>;
  may_manage: boolean;
}

export default function LegalOrderDetail({ id }: { id: string }) {
  const dialog = useDialog();
  const [data, setData] = useState<Detail | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<OrderStatus>("open");
  const [dueAt, setDueAt] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    const res = await deskCall<Detail>(`/api/admin/compliance/legal-orders/${id}`);
    if (res.ok && res.data) {
      setData(res.data);
      setStatus(res.data.order.status);
      setLoadedAt(Date.now());
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the order.");
    }
  }, [id]);

  // Necessary setState-in-effect: the order comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function send(path: string, method: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true);
    const res = await deskCall(`/api/admin/compliance/legal-orders/${id}${path}`, { method, body: JSON.stringify(body) });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: res.error ?? "Not done." });
    if (res.ok) await load();
    return res.ok;
  }

  const saveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "closed") {
      const sure = await dialog.confirm({ title: "Close this order?", message: "A closed order is final: its state and deadline cannot change afterwards. Actions can still be added.", confirmLabel: "Close it" });
      if (!sure) return;
    }
    const body: Record<string, unknown> = { status };
    if (dueAt) body.due_at = new Date(dueAt).toISOString();
    if (await send("", "PATCH", body, "The order is updated.")) setDueAt("");
  };

  const addAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await send("/actions", "POST", { body: action }, "The action is recorded.")) setAction("");
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
  if (!data) return <p role="status" className={hint}>Loading the order…</p>;

  const o = data.order;
  const closed = o.status === "closed";
  const clock = clockBadge(o, loadedAt);
  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold">{o.reference}</h1>
        <span className={`${badge} ${statusTone(o.status)}`}>{ORDER_STATUS_LABELS[o.status]}</span>
        {clock && <span className={`${badge} ${clock.className}`}>{clock.text}</span>}
      </header>
      <ActionMessage message={message} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section aria-labelledby="order-title" className={`${card} space-y-3`}>
            <h2 id="order-title" className={cardTitle}>
              The order
            </h2>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="font-semibold">Made by</dt>
              <dd>
                {o.authority} ({AUTHORITY_TYPE_LABELS[o.authority_type]})
              </dd>
              <dt className="font-semibold">Dated</dt>
              <dd>{o.order_date ?? "—"}</dd>
              <dt className="font-semibold">Reached us</dt>
              <dd>
                {when(o.received_at)} · {RECEIVED_VIA_LABELS[o.received_via]}
              </dd>
              <dt className="font-semibold">It asks</dt>
              <dd>{o.asks.map((a) => ORDER_ASK_LABELS[a]).join(", ")}</dd>
              <dt className="font-semibold">Deadline</dt>
              <dd>{o.due_at ? when(o.due_at) : "None given"}</dd>
              <dt className="font-semibold">The original</dt>
              <dd>{o.original_kept_at}</dd>
              <dt className="font-semibold">Entered</dt>
              <dd>
                {when(o.created_at)} by {o.created_by_name}
                {o.updated_at ? `; last changed ${when(o.updated_at)} by ${o.updated_by_name}` : ""}
              </dd>
            </dl>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-[#25282d]">{o.summary}</p>
            {data.stories.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">The stories it is about</p>
                <ul className="space-y-1">
                  {data.stories.map((s) => (
                    <li key={s.id} className="text-sm">
                      <Link href={`/admin/desk/${s.id}`} className={link}>
                        {s.headline ?? "The Desk story"}
                      </Link>{" "}
                      <span className={hint}>({STATE_LABELS[s.workflow_state] ?? s.workflow_state})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section aria-labelledby="actions-title" className={`${card} space-y-3`}>
            <h2 id="actions-title" className={cardTitle}>
              What was done
            </h2>
            {data.actions.length === 0 && <p className={hint}>Nothing recorded yet.</p>}
            {data.actions.length > 0 && (
              <ol aria-label="Actions, oldest first" className="space-y-2">
                {data.actions.map((a) => (
                  <li key={a.id} className={`${item} space-y-1`}>
                    <p className={hint}>
                      {a.author_name}, {when(a.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {data.may_manage && (
              <form onSubmit={addAction} className="space-y-2">
                <label className={label}>
                  An action
                  <textarea value={action} onChange={(e) => setAction(e.target.value)} maxLength={LEGAL_ORDER_LIMITS.action} rows={3} required className={`${field} mt-1`} placeholder="Took the story down on the Desk; replied to the court." />
                </label>
                <div className="flex justify-end">
                  <button type="submit" disabled={busy || !action.trim()} className={button}>
                    Record the action
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {data.may_manage && !closed && (
            <form onSubmit={saveStatus} aria-labelledby="state-title" className={panel}>
              <h2 id="state-title" className={panelTitle}>
                Its state
              </h2>
              <label className={label}>
                State
                <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={`${field} mt-1`}>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                A new deadline (optional)
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={`${field} mt-1`} />
              </label>
              <button type="submit" disabled={busy} className={buttonPrimary}>
                Save
              </button>
            </form>
          )}
          {closed && <p className={hint}>This order is closed: it is final. Actions can still be recorded.</p>}
          {!data.may_manage && <p className={hint}>You can read the register. Legal keeps it.</p>}
        </aside>
      </div>
    </div>
  );
}
