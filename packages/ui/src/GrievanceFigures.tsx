import { CORRECTION_KIND_LABELS, CORRECTION_KINDS } from "@timesprime/shared/config/corrections";
import type { GrievanceFigures as Figures } from "@timesprime/shared/config/grievanceReports";
import { GRIEVANCE_CATEGORIES, GRIEVANCE_CATEGORY_LABELS, GRIEVANCE_CHANNEL_LABELS, GRIEVANCE_OUTCOME_LABELS, GRIEVANCE_OUTCOMES } from "@timesprime/shared/config/grievances";

// A month's grievance figures (Panel 7 design §5, M3), as tables: the same view on the reader's
// /grievance-report page and in the back office's draft, so the officer publishes what readers will
// see. Counts only: the figures hold no name, email, text or ticket.

const CHANNELS = ["web", "email", "post", "other"] as const;

function Table({ caption, rows }: { caption: string; rows: Array<[string, number | string]> }) {
  return (
    <table className="w-full text-sm">
      <caption className="pb-1 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-slate-100 dark:border-[#2b2f36]">
            <th scope="row" className="py-1 pr-3 text-left font-normal">
              {label}
            </th>
            <td className="py-1 text-right font-semibold tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GrievanceFigures({ figures }: { figures: Figures }) {
  const { received, decided, open, corrections } = figures;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-3">
        <Table caption="Grievances received" rows={[["In all", received.total]]} />
        <Table caption="By what they were about" rows={GRIEVANCE_CATEGORIES.map((c) => [GRIEVANCE_CATEGORY_LABELS[c].en, received.by_category[c] ?? 0])} />
        <Table
          caption="By language and how they arrived"
          rows={[
            ["English", received.by_language.en ?? 0],
            ["Hindi", received.by_language.hi ?? 0],
            ...CHANNELS.map((c): [string, number] => [GRIEVANCE_CHANNEL_LABELS[c], received.by_channel[c] ?? 0]),
          ]}
        />
      </div>
      <div className="space-y-3">
        <Table
          caption="Decided"
          rows={[
            ["In all", decided.total],
            ["Within 15 days", decided.within_15_days],
            ["After 15 days", decided.late],
            ["Median days to decide", decided.median_days === null ? "—" : decided.median_days],
          ]}
        />
        <Table caption="Decisions" rows={GRIEVANCE_OUTCOMES.map((o) => [GRIEVANCE_OUTCOME_LABELS[o].en, decided.by_outcome[o] ?? 0])} />
        <Table
          caption="Still open"
          rows={[
            ["In all", open.total],
            ["Past their 15 days", open.late],
          ]}
        />
        <Table caption="Corrections published" rows={[["In all", corrections.total], ...CORRECTION_KINDS.map((k): [string, number] => [CORRECTION_KIND_LABELS[k].en, corrections.by_kind[k] ?? 0])]} />
      </div>
    </div>
  );
}
