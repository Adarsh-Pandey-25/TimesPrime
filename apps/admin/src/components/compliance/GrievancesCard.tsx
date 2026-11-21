"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { deskCall } from "../desk/deskClient";
import { button, card, cardTitle, hint, tone } from "../ui/styles";

// The dashboard's grievance card (Panel 7 design §4): how many grievances are open, and how many of
// those are late, for holders of grievance.handle. The queue itself is on the Compliance screen.

interface Counts {
  open: number;
  late: number;
  ackLate: number;
}

export default function GrievancesCard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await deskCall<{ counts: Counts }>("/api/admin/compliance/grievances?state=open");
      if (cancelled) return;
      if (res.ok && res.data) setCounts(res.data.counts);
      else setError(res.error ?? "Could not count the grievances.");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const late = counts ? counts.late + counts.ackLate : 0;
  return (
    <section aria-label="Grievances" className={`${card} space-y-3`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${late > 0 ? tone.red : tone.blue}`}>
          <Inbox aria-hidden="true" className="h-5 w-5" />
        </span>
        <h2 className={cardTitle}>Grievances</h2>
      </div>
      {!counts && !error && <p role="status" className={hint}>Counting the grievances…</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {counts && (
        <p className="text-sm font-semibold">
          {counts.open === 0 ? "No open grievances." : `${counts.open} open`}
          {counts.late > 0 && <span className="text-red-700 dark:text-red-300"> · {counts.late} past their 15 days</span>}
          {counts.ackLate > 0 && <span className="text-red-700 dark:text-red-300"> · {counts.ackLate} not acknowledged in 24 hours</span>}
        </p>
      )}
      <Link href="/admin/compliance" className={button}>
        Open the grievances
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}
