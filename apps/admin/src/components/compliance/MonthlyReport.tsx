"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import GrievanceFigures from "@timesprime/ui/GrievanceFigures";
import { monthLabel, REPORT_NOTE_MAX, type GrievanceFigures as Figures } from "@timesprime/shared/config/grievanceReports";
import { deskCall, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { badge, buttonPrimary, card, cardTitle, field, hint, item, label, link, tone } from "../ui/styles";

// The monthly grievance report (Panel 7 design §5, M3): a month's draft figures, computed now; a note;
// "Publish"; and the month's published versions. Published figures never change: publishing again
// makes the next version, beside the first. The Grievance Officer and Legal publish; the Managing
// Editor reads.

interface Published {
  id: string;
  version: number;
  figures: Figures;
  note: string | null;
  published_at: string;
  published_by_name: string;
}

interface MonthView {
  month: string;
  months: string[];
  applied: boolean;
  draft: Figures | null;
  published: Published[];
  due_at: string;
  overdue: boolean;
  may_publish: boolean;
}

export default function MonthlyReport() {
  const dialog = useDialog();
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<MonthView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async () => {
    const res = await deskCall<MonthView>(`/api/admin/compliance/reports${month ? `?month=${month}` : ""}`);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the report.");
    }
  }, [month]);

  // Necessary setState-in-effect: the report comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const publish = async () => {
    if (!data) return;
    const again = data.published.length > 0;
    const sure = await dialog.confirm({
      title: `Publish ${monthLabel(data.month)}'s report?`,
      message: again
        ? `It becomes version ${data.published[0].version + 1}, shown beside the earlier one, which stays. The figures are counted again at this moment.`
        : "Readers see it at once at /grievance-report. Published figures never change; a reissue is a new version.",
      confirmLabel: "Publish",
    });
    if (!sure) return;
    setBusy(true);
    const res = await deskCall<{ report: Published }>("/api/admin/compliance/reports", { method: "POST", body: JSON.stringify({ month: data.month, note: note.trim() || null }) });
    setBusy(false);
    if (!res.ok || !res.data) return setMessage({ ok: false, text: res.error ?? "The report was not published." });
    setMessage({ ok: true, text: `Published: ${monthLabel(data.month)}, version ${res.data.report.version}.` });
    setNote("");
    await load();
  };

  return (
    <section aria-labelledby="report-title" className={`${card} space-y-4`}>
      <div className="space-y-1">
        <h2 id="report-title" className={`${cardTitle} flex items-center gap-2`}>
          <CalendarCheck aria-hidden="true" className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Monthly report
        </h2>
        <p className={hint}>
          Each month&apos;s grievances and the action taken (Rule 18(3)), published by the 7th of the next month at{" "}
          <a href="/grievance-report" target="_blank" rel="noopener noreferrer" className={link}>
            /grievance-report
          </a>
          .
        </p>
      </div>

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" onClick={load} className={link}>
            Try again
          </button>
        </p>
      )}
      {!data && !loadError && <p role="status" className={hint}>Loading the report…</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>
              Month
              <select value={data.month} onChange={(e) => setMonth(e.target.value)} className={`${field} mt-1`}>
                {data.months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            {data.published.length > 0 ? (
              <span className={`${badge} ${tone.green}`}>Published, version {data.published[0].version}</span>
            ) : (
              <span className={`${badge} ${data.overdue ? tone.red : tone.amber}`}>
                {data.overdue ? `Not published: it was due ${when(data.due_at)}` : `Due by ${when(data.due_at)}`}
              </span>
            )}
          </div>

          {!data.applied && <p className={hint}>The monthly report is not set up yet: compliance-3 is waiting to be applied.</p>}

          {data.applied && data.draft && (
            <div className={`${item} space-y-3`}>
              <p className="text-sm font-semibold">The figures now, as they would be published ({when(data.draft.as_of)})</p>
              <GrievanceFigures figures={data.draft} />
            </div>
          )}

          <ActionMessage message={message} />

          {data.applied && data.may_publish && (
            <div className="space-y-2">
              <label className={label}>
                A note readers see with it (optional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={REPORT_NOTE_MAX} rows={3} className={`${field} mt-1`} placeholder="Three grievances were about the same story." />
              </label>
              <button type="button" disabled={busy} onClick={() => void publish()} className={buttonPrimary}>
                {busy ? "Publishing…" : data.published.length > 0 ? "Publish again (new version)" : "Publish"}
              </button>
            </div>
          )}
          {data.applied && !data.may_publish && <p className={hint}>You can read the report. The Grievance Officer and Legal publish it.</p>}

          {data.published.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Published</h3>
              <ol aria-label="Published versions, newest first" className="space-y-2">
                {data.published.map((r) => (
                  <li key={r.id} className={`${item} space-y-1`}>
                    <p className="text-sm font-semibold">
                      Version {r.version}, {when(r.published_at)}, by {r.published_by_name}
                    </p>
                    <p className={hint}>
                      {r.figures.received.total} received, {r.figures.decided.total} decided, {r.figures.open.total} open
                    </p>
                    {r.note && <p className="text-sm">{r.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
