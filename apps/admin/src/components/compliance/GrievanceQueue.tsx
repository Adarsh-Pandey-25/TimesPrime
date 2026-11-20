"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Plus, Search } from "lucide-react";
import { deskCall, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { badge, button, buttonPrimary, card, cardTitle, field, hint, item, link } from "../ui/styles";
import AddGrievanceForm from "./AddGrievanceForm";
import { categoryLabel, channelLabel, clockBadge, nameOf, type Grievance } from "./grievanceClient";

// The grievance queue (Panel 7 design §4, M1): the open grievances, the decision due soonest first,
// each with its clock; the decided ones; a search by ticket; and "Add a grievance" for one received
// another way. The Managing Editor (grievance.handle R) reads it with the emails masked.

type Filter = "open" | "decided" | "all";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
];

interface Queue {
  grievances: Grievance[];
  counts: { open: number; late: number; ackLate: number };
  may_handle: boolean;
}

export default function GrievanceQueue() {
  const [filter, setFilter] = useState<Filter>("open");
  const [ticket, setTicket] = useState("");
  const [searched, setSearched] = useState("");
  const [data, setData] = useState<Queue | null>(null);
  // When the queue was read: what the clocks are measured against (a render reads no clock).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async () => {
    const query = `state=${filter}${searched ? `&ticket=${encodeURIComponent(searched)}` : ""}`;
    const res = await deskCall<Queue>(`/api/admin/compliance/grievances?${query}`);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadedAt(Date.now());
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the grievances.");
    }
  }, [filter, searched]);

  // Necessary setState-in-effect: the queue comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setSearched(ticket.trim());
    if (ticket.trim()) setFilter("all");
  };

  const counts = data?.counts;
  return (
    <section aria-labelledby="grievances-title" className={`${card} space-y-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="grievances-title" className={`${cardTitle} flex items-center gap-2`}>
            <Inbox aria-hidden="true" className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Grievances
          </h2>
          <p className={hint}>Acknowledge within 24 hours and decide within 15 days of a grievance arriving. The form&apos;s grievances are acknowledged on the spot.</p>
        </div>
        {data?.may_handle && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={button}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add a grievance
          </button>
        )}
      </div>

      {counts && (
        <p role="status" className="text-sm font-semibold">
          {counts.open} open
          {counts.late > 0 && <span className="text-red-700 dark:text-red-300"> · {counts.late} late</span>}
          {counts.ackLate > 0 && <span className="text-red-700 dark:text-red-300"> · {counts.ackLate} not acknowledged in time</span>}
        </p>
      )}

      {adding && (
        <AddGrievanceForm
          onCancel={() => setAdding(false)}
          onAdded={(g) => {
            setAdding(false);
            setMessage({ ok: true, text: `Added as ${g.ticket}.` });
            load();
          }}
        />
      )}
      <ActionMessage message={message} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label="Show" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setSearched("");
                setTicket("");
              }}
              className={filter === f.key ? buttonPrimary : button}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={search} className="flex items-end gap-2">
          <label className="text-sm font-semibold">
            Ticket
            <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="G-2026-00042" className={`${field} mt-1`} />
          </label>
          <button type="submit" className={button}>
            <Search aria-hidden="true" className="h-4 w-4" />
            Find
          </button>
        </form>
      </div>

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" onClick={load} className={link}>
            Try again
          </button>
        </p>
      )}
      {!data && !loadError && <p role="status" className={hint}>Loading the grievances…</p>}
      {data && data.grievances.length === 0 && (
        <p className={hint}>{searched ? `No grievance has the ticket ${searched}.` : filter === "open" ? "No open grievances." : "No grievances yet."}</p>
      )}
      {data && data.grievances.length > 0 && (
        <ol aria-label="Grievances" className="space-y-3">
          {data.grievances.map((g) => {
            const clock = clockBadge(g, loadedAt);
            const handler = nameOf(g, g.assigned_to);
            return (
              <li key={g.id} className={`${item} space-y-1.5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/compliance/grievances/${g.id}`} className={`${link} font-mono text-sm font-bold`}>
                    {g.ticket}
                  </Link>
                  <span className={`${badge} ${clock.className}`}>{clock.text}</span>
                  <span className={hint}>
                    {categoryLabel(g.category)} · {channelLabel(g.channel)} · arrived {when(g.received_at)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm" lang={g.language}>
                  {g.body}
                </p>
                <p className={hint}>
                  From {g.name}
                  {handler ? ` · handled by ${handler}` : " · nobody has taken it yet"}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
