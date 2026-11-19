"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROLE_KEYS } from "@timesprime/shared/config/permissions";
import { deskCall, when } from "../desk/deskClient";
import AlertsPanel from "./AlertsPanel";
import RequestsBox from "./RequestsBox";
import { day, deskLabel, roleLabel, type CallerView, type PersonView, type RequestView } from "./peopleClient";
import { UserPlus } from "lucide-react";
import { badge, buttonPrimary, card, cardTitle, fieldInline as field, hint, label, link, pageTitle, rowHover, tone } from "../ui/styles";

// The staff directory (Panel 1 design §4): everyone for a Super Admin, the people of a Managing
// Editor's desks for them. Each person's status, live roles with desk and expiry, second factor and
// last sign-in, with filters. A Super Admin also sees the requests waiting for them. The server
// decides what each caller sees and may do.
//
// In the order a visit needs it (the owner, 19 Nov 2026): what the page is and its main action;
// what needs a look; the requests to decide; then everyone.

interface Directory {
  people: PersonView[];
  caller: CallerView;
  accounts: boolean;
}

export default function PeopleDirectory() {
  const [dir, setDir] = useState<Directory | null>(null);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await deskCall<Directory>("/api/admin/people");
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not load the staff.");
      return;
    }
    setError("");
    setDir(res.data);
    if (res.data.caller.asks) {
      const reqs = await deskCall<{ requests: RequestView[] }>("/api/admin/people/requests");
      setRequests(reqs.ok && reqs.data ? reqs.data.requests : []);
    }
  }, []);

  // Necessary setState-in-effect: the directory comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!dir) return [];
    const q = query.trim().toLowerCase();
    return dir.people.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)) &&
        (!role || p.roles.some((r) => r.role === role)) &&
        (!language || p.roles.some((r) => r.language === language || r.language === null)) &&
        (!status || p.status === status)
    );
  }, [dir, query, role, language, status]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">
        {error}
      </p>
    );
  }
  if (!dir) return <p aria-live="polite" className="text-sm text-slate-500">Loading the staff…</p>;

  const { caller } = dir;
  return (
    <div className="space-y-6">
      {/* 1. What this page is, and its main action. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-1">
          <h1 className={pageTitle}>People</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {caller.asks
              ? "You see every staff member. Adding access is a request a second Super Admin approves; removing access is done at once."
              : `You manage Writer, Sub-editor and Desk Editor in: ${caller.scopes.map(deskLabel).join(", ") || "no desk"}.`}
          </p>
          {!dir.accounts && <p className="text-xs text-amber-700 dark:text-amber-300">Emails and second factors could not be read from Supabase Auth just now.</p>}
        </div>
        {caller.grantable.length > 0 && (
          <Link href="/admin/people/new" className={buttonPrimary}>
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            {caller.asks ? "Ask to add a person" : "Add a person"}
          </Link>
        )}
      </header>

      {/* 2. What needs a look: emergency access, the review, roles ending soon. */}
      <AlertsPanel superAdmin={caller.asks} />

      {/* 3. Requests: waiting for this Super Admin, then their own. */}
      {caller.asks && <RequestsBox requests={requests} onChanged={() => void load()} />}

      {/* 4. Everyone, with filters. */}
      <section aria-label="Staff" className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className={cardTitle}>
            Staff <span className={`${hint} ml-1 font-normal`}>{shown.length} of {dir.people.length}</span>
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>
              Search
              <input className={`${field} mt-1 block w-56`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" />
            </label>
            <label className={label}>
              Role
              <select className={`${field} mt-1 block`} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All roles</option>
                {ROLE_KEYS.map((k) => (
                  <option key={k} value={k}>{roleLabel(k)}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Language
              <select className={`${field} mt-1 block`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">All</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
            <label className={label}>
              Status
              <select className={`${field} mt-1 block`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
        </div>

        {dir.people.length === 0 ? (
          <p className="text-sm text-slate-500">No staff to show here yet.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody matches these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2b2f36]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-[#2b2f36] dark:bg-[#25282d] dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Roles</th>
                  <th scope="col" className="px-4 py-3">Second factor</th>
                  <th scope="col" className="px-4 py-3">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.userId} className={`border-b border-slate-100 align-top last:border-0 dark:border-[#2b2f36] ${rowHover}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                          {p.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <div>
                          <Link href={`/admin/people/${p.userId}`} className={link}>{p.name}</Link>
                          {p.email && <span className="block text-xs text-slate-500">{p.email}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`${badge} ${p.status === "active" ? tone.green : tone.red}`}>{p.status === "active" ? "Active" : "Suspended"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {p.roles.length === 0 ? (
                        <span className="text-slate-500">No live role</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {p.roles.map((r) => (
                            <li key={r.id}>
                              <span className="font-semibold">{roleLabel(r.role)}</span> <span className="text-slate-500">· {deskLabel(r)} · until {day(r.expiresAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.hasFactor === null ? "—" : p.hasFactor ? <span className={`${badge} ${tone.green}`}>Set</span> : <span className={`${badge} ${tone.amber}`}>Not set yet</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.lastSignInAt ? when(p.lastSignInAt) : "Not signed in yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
