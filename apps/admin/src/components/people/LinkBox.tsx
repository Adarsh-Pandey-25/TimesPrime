"use client";

import { useState } from "react";
import { LINK_VALID_FOR } from "@timesprime/shared/config/people";
import { Check, Copy, KeyRound } from "lucide-react";
import { buttonPrimary, fieldInline as field } from "../ui/styles";

// A one-time "set your password" link, shown once (Panel 1 design §4): the API gives the path, and
// the address is this back office's own, which the person will use. It is kept nowhere, so it is
// shown now or never; whoever holds it can set the password, so it is handed over directly.

export default function LinkBox({ path, who }: { path: string; who?: string | null }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section aria-label="One-time link" className="animate-pop-in space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm shadow-sm dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-2">
        <KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="space-y-1">
          <p className="font-semibold">{who ? `The link for ${who}` : "The link"}: it works once, for {LINK_VALID_FOR}, and is shown only now.</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Hand it over in person, by phone or in a direct message, never in a group: whoever holds it can set the password.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input readOnly aria-label="One-time link address" value={url} onFocus={(e) => e.target.select()} className={`${field} min-w-0 flex-1 font-mono text-xs`} />
        <button type="button" className={buttonPrimary} onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}
