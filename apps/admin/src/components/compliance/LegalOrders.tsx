"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Scale } from "lucide-react";
import {
  AUTHORITY_TYPE_LABELS,
  AUTHORITY_TYPES,
  LEGAL_ORDER_LIMITS,
  ORDER_ASK_LABELS,
  ORDER_ASKS,
  ORDER_STATUS_LABELS,
  orderClock,
  RECEIVED_VIA,
  RECEIVED_VIA_LABELS,
  type AuthorityType,
  type OrderAsk,
  type OrderStatus,
  type ReceivedVia,
} from "@timesprime/shared/config/legalOrders";
import { deskCall, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { badge, button, buttonPrimary, card, cardTitle, field, hint, item, label, link, tone } from "../ui/styles";

// The legal-orders register (Panel 7 design §4, M4): confidential; for holders of legal_order.manage.
// Open orders by their deadline, each with its state; "Add an order" for Legal. The server decides
// who may act (may_manage) and every change.

export interface OrderSummary {
  id: string;
  reference: string;
  authority_type: AuthorityType;
  authority: string;
  received_at: string;
  asks: OrderAsk[];
  due_at: string | null;
  status: OrderStatus;
}

export function clockBadge(o: Pick<OrderSummary, "status" | "due_at">, now: number): { text: string; className: string } | null {
  const clock = orderClock(o, now);
  if (clock === "late") return { text: `Late: due ${when(o.due_at)}`, className: tone.red };
  if (clock === "due_soon") return { text: `Due ${when(o.due_at)}`, className: tone.amber };
  if (clock === "due") return { text: `Due ${when(o.due_at)}`, className: tone.slate };
  return null;
}

export const statusTone = (s: OrderStatus) => (s === "closed" || s === "complied" ? tone.green : s === "challenged" ? tone.blue : tone.amber);

function AddOrder({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [reference, setReference] = useState("");
  const [authorityType, setAuthorityType] = useState<AuthorityType>("court");
  const [authority, setAuthority] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [receivedVia, setReceivedVia] = useState<ReceivedVia>("email");
  const [asks, setAsks] = useState<OrderAsk[]>([]);
  const [summary, setSummary] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [kept, setKept] = useState("");
  const [stories, setStories] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await deskCall("/api/admin/compliance/legal-orders", {
      method: "POST",
      body: JSON.stringify({
        reference,
        authority_type: authorityType,
        authority,
        order_date: orderDate || null,
        received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
        received_via: receivedVia,
        asks,
        summary,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        original_kept_at: kept,
        stories: stories.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "The order was not added." });
    onAdded();
  };

  return (
    <form onSubmit={submit} aria-label="Add an order" className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-[#2b2f36]">
      <h3 className="text-sm font-bold">Add an order</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Its reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={LEGAL_ORDER_LIMITS.reference} className={`${field} mt-1`} placeholder="W.P.(C) 1234/2026" />
        </label>
        <label className={label}>
          Who made it
          <select value={authorityType} onChange={(e) => setAuthorityType(e.target.value as AuthorityType)} className={`${field} mt-1`}>
            {AUTHORITY_TYPES.map((a) => (
              <option key={a} value={a}>
                {AUTHORITY_TYPE_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Its name
          <input value={authority} onChange={(e) => setAuthority(e.target.value)} required maxLength={LEGAL_ORDER_LIMITS.authority} className={`${field} mt-1`} placeholder="Delhi High Court" />
        </label>
        <label className={label}>
          The order&apos;s date (optional)
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className={label}>
          When it reached us (your clock)
          <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required className={`${field} mt-1`} />
        </label>
        <label className={label}>
          How it reached us
          <select value={receivedVia} onChange={(e) => setReceivedVia(e.target.value as ReceivedVia)} className={`${field} mt-1`}>
            {RECEIVED_VIA.map((v) => (
              <option key={v} value={v}>
                {RECEIVED_VIA_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className={label}>What it asks</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ORDER_ASKS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={asks.includes(a)} onChange={(e) => setAsks((now) => (e.target.checked ? [...now, a] : now.filter((x) => x !== a)))} />
              {ORDER_ASK_LABELS[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        What it says, in a few lines
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} required maxLength={LEGAL_ORDER_LIMITS.summary} rows={4} className={`${field} mt-1`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Its deadline (optional)
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className={label}>
          Where the original is kept
          <input value={kept} onChange={(e) => setKept(e.target.value)} required maxLength={LEGAL_ORDER_LIMITS.originalKeptAt} className={`${field} mt-1`} placeholder="Legal's drive, Orders/2026" />
        </label>
      </div>
      <label className={label}>
        The stories it is about: their addresses, one a line (optional)
        <textarea value={stories} onChange={(e) => setStories(e.target.value)} rows={2} className={`${field} mt-1`} placeholder="https://timesprime247.com/india/…" />
      </label>
      <ActionMessage message={message} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={button}>
          Cancel
        </button>
        <button type="submit" disabled={busy || asks.length === 0} className={buttonPrimary}>
          {busy ? "Adding…" : "Add the order"}
        </button>
      </div>
    </form>
  );
}

export default function LegalOrders() {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [data, setData] = useState<{ orders: OrderSummary[]; applied: boolean; may_manage: boolean } | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async () => {
    const res = await deskCall<{ orders: OrderSummary[]; applied: boolean; may_manage: boolean }>(`/api/admin/compliance/legal-orders?status=${filter}`);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadedAt(Date.now());
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the register.");
    }
  }, [filter]);

  // Necessary setState-in-effect: the register comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <section aria-labelledby="orders-title" className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="orders-title" className={`${cardTitle} flex items-center gap-2`}>
            <Scale aria-hidden="true" className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            Legal orders
          </h2>
          <p className={hint}>Confidential: Legal and the Managing Editor only. Court, government, police and self-regulatory orders, with what was done.</p>
        </div>
        {data?.may_manage && data.applied && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={button}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add an order
          </button>
        )}
      </div>

      {adding && (
        <AddOrder
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            setMessage({ ok: true, text: "The order is added." });
            load();
          }}
        />
      )}
      <ActionMessage message={message} />

      <div role="group" aria-label="Show orders" className="flex gap-1">
        {(["open", "all"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={filter === f ? buttonPrimary : button}>
            {f === "open" ? "Not closed" : "All"}
          </button>
        ))}
      </div>

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" onClick={load} className={link}>
            Try again
          </button>
        </p>
      )}
      {!data && !loadError && <p role="status" className={hint}>Loading the register…</p>}
      {data && !data.applied && <p className={hint}>The register is not set up yet: compliance-4 is waiting to be applied.</p>}
      {data && data.applied && data.orders.length === 0 && <p className={hint}>{filter === "open" ? "No open orders." : "No orders yet."}</p>}
      {data && data.orders.length > 0 && (
        <ol aria-label="Legal orders" className="space-y-3">
          {data.orders.map((o) => {
            const clock = clockBadge(o, loadedAt);
            return (
              <li key={o.id} className={`${item} space-y-1`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/compliance/legal-orders/${o.id}`} className={`${link} font-semibold`}>
                    {o.reference}
                  </Link>
                  <span className={`${badge} ${statusTone(o.status)}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                  {clock && <span className={`${badge} ${clock.className}`}>{clock.text}</span>}
                </div>
                <p className={hint}>
                  {o.authority} · {o.asks.map((a) => ORDER_ASK_LABELS[a]).join(", ")} · reached us {when(o.received_at)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
