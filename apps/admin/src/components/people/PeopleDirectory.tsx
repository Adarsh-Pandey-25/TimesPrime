"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROLE_KEYS } from "@timesprime/shared/config/permissions";
import { deskCall, when } from "../desk/deskClient";
import RequestsBox from "./RequestsBox";
import { day, deskLabel, roleLabel, type CallerView, type PersonView, type RequestView } from "./peopleClient";

// The staff directory (Panel 1 design §4): everyone for a Super Admin, the people of a Managing
// Editor's desks for them. Each person's status, live roles with desk and expiry, second factor and
// last sign-in, with filters. A Super Admin also sees the requests waiting for them. The server
// decides what each caller sees and may do.

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";

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
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-extrabold">People</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {caller.asks
            ? "You see every staff member. Adding access is a request a second Super Admin approves; removing access is done at once."
            : `You manage Writer, Sub-editor and Desk Editor in: ${caller.scopes.map(deskLabel).join(", ") || "no desk"}.`}
        </p>
        {!dir.accounts && <p className="text-xs text-amber-700 dark:text-amber-300">Emails and second factors could not be read from Supabase Auth just now.</p>}
      </div>

      {caller.asks && <RequestsBox requests={requests} onChanged={() => void load()} />}

      <section aria-label="Staff" className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Search
            <input className={`${field} ml-2`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" />
          </label>
          <label className="text-sm font-semibold">
            Role
            <select className={`${field} ml-2`} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {ROLE_KEYS.map((k) => (
                <option key={k} value={k}>{roleLabel(k)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Language
            <select className={`${field} ml-2`} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">All</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Status
            <select className={`${field} ml-2`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        </div>

        {dir.people.length === 0 ? (
          <p className="text-sm text-slate-500">No staff to show here yet.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody matches these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-[#2b2f36] dark:bg-[#202327]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-[#2b2f36]">
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
                  <tr key={p.userId} className="border-b border-slate-100 align-top last:border-0 dark:border-[#2b2f36]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/people/${p.userId}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{p.name}</Link>
                      {p.email && <span className="block text-xs text-slate-500">{p.email}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={p.status === "active" ? "text-green-700 dark:text-green-300" : "font-bold text-red-700 dark:text-red-300"}>
                        {p.status === "active" ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.roles.length === 0 ? (
                        <span className="text-slate-500">No live role</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {p.roles.map((r) => (
                            <li key={r.id}>
                              {roleLabel(r.role)} <span className="text-slate-500">· {deskLabel(r)} · until {day(r.expiresAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.hasFactor === null ? "—" : p.hasFactor ? "Set" : <span className="text-amber-700 dark:text-amber-300">Not set yet</span>}</td>
                    <td className="px-4 py-3">{p.lastSignInAt ? when(p.lastSignInAt) : "Not signed in yet"}</td>
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
