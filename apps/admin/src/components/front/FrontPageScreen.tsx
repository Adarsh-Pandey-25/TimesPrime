"use client";

import { isBannerLanguage } from "@timesprime/shared/config/breakingNews";
import BreakingNewsManager from "../BreakingNewsManager";
import { canAct, useAdminMe } from "../desk/deskClient";
import { pageTitle } from "../ui/styles";
import PinnedSlots from "./PinnedSlots";

// The Front page screen (Panel 3 design §4): what readers see first. The pinned stories of each
// page, then the breaking banner (decision 5: moved here from the dashboard, which links to it).
// Each part shows for the permission its routes need; hiding is UX, the server decides.

export default function FrontPageScreen() {
  const { me, error } = useAdminMe();
  const held = (permission: string) => Boolean(me && me.kind === "staff" && me.permissions[permission]);
  const canPins = held("homepage.curate");
  const canBanner = canAct(me, "breaking_banner.manage");
  // Both parts start on the caller's own language, if a role of theirs has one.
  const ownLanguage = me?.roles.map((r) => r.language).find(isBannerLanguage) ?? null;
  const needsCode = me?.kind === "staff" && me.aal === "aal1" && me.mfa.required;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={pageTitle}>Front page</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          What readers see first: the stories pinned above each page&apos;s automatic order, and the breaking banner.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {!me && !error && <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Checking your access…</p>}
      {needsCode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Your account needs a second factor. <a href="/admin/login" className="underline">Finish signing in</a> with your authenticator code.
        </p>
      )}
      {me && !needsCode && !canPins && !canBanner && (
        <p className="text-sm text-slate-600 dark:text-slate-300">Your roles do not include the front page. A Managing Editor or a Desk Editor arranges it.</p>
      )}

      {me && !needsCode && canPins && <PinnedSlots ownLanguage={ownLanguage} />}
      {me && !needsCode && canBanner && <BreakingNewsManager ownLanguage={ownLanguage} />}
    </div>
  );
}
