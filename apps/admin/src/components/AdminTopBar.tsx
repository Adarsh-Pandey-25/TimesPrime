"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@timesprime/ui/ThemeContext";
import { describeRoles } from "@timesprime/shared/lib/staffRoles";
import { useAdminMe } from "./desk/deskClient";
import { clock, useAlerts } from "./people/alerts";
import { button } from "./ui/styles";

// The back office's own masthead, on every page: where to go, who is signed in and as what (the
// owner asked, 18 Nov 2026), signing out, and the theme. The reader site's header and ticker fetch
// the public feed, which this app does not serve.
//
// On a phone it takes two rows (the owner, 19 Nov 2026): the name and the controls, then the links.
// The page's own link is marked, for the eye (colour) and for a screen reader (aria-current).

const SECTIONS = [
  { href: "/admin", label: "Dashboard", here: (path: string) => path === "/admin" },
  { href: "/admin/desk", label: "Desk", here: (path: string) => path.startsWith("/admin/desk") },
  { href: "/admin/people", label: "People", here: (path: string) => path.startsWith("/admin/people") },
] as const;

export default function AdminTopBar() {
  const router = useRouter();
  const path = usePathname() ?? "";
  const { theme, toggleTheme } = useTheme();
  const { me } = useAdminMe();
  const isDark = theme === "dark";
  // Panel 1, M3: Super Admins see, on every page, any emergency access in use and a review that is due.
  const superAdmin = me?.kind === "staff" && me.permissions["role.assign"] === "ask";
  const { alerts } = useAlerts(superAdmin);
  // Panel 1: People is for holders of user.manage (a Super Admin asks, a Managing Editor acts). UX only.
  const sections = SECTIONS.filter((s) => s.href !== "/admin/people" || (me?.kind === "staff" && me.permissions["user.manage"]));

  const signOut = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } finally {
      router.push("/admin/login");
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm dark:border-[#2b2f36] dark:bg-[#202327]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8 lg:px-10">
        <span className="font-serif text-lg font-extrabold text-slate-900 dark:text-white">
          TimesPrime <span className="text-blue-600 dark:text-blue-400">Admin</span>
        </span>

        <nav aria-label="Back office" className="order-last -mx-1 flex w-full gap-1 overflow-x-auto text-sm font-semibold md:order-none md:mr-auto md:w-auto">
          {sections.map((s) => {
            const here = s.here(path);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={here ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                  here
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#2b2f36] dark:hover:text-white"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        {/* Who is signed in, and as what: beside the controls, or on a phone its own line under the links. */}
        {me && (
          <p className="order-last w-full text-xs sm:order-none sm:ml-auto sm:w-auto sm:text-right">
            <span className="font-semibold text-slate-900 sm:block dark:text-white">{`Signed in as ${me.displayName}`}</span>
            {me.roles.length > 0 && <span className="text-slate-500 sm:block"><span className="sm:hidden"> · </span>{describeRoles(me.roles)}</span>}
          </p>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => void signOut()} className={button}>
            <LogOut size={14} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#2b2f36] dark:hover:text-white"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
      {superAdmin && alerts.breakGlass.length > 0 && (
        <div role="alert" className="bg-red-700 px-4 py-2 text-sm font-semibold text-white sm:px-8 lg:px-10">
          {alerts.breakGlass.map((b) => (
            <p key={b.assignmentId}>
              Emergency access is on: {b.mine ? "yours" : (b.name ?? "a Super Admin")}, until {clock(b.until)}. Reason: {b.reason}{" "}
              <Link href="/admin/people" className="underline">See People</Link>
            </p>
          ))}
        </div>
      )}
      {superAdmin && alerts.review?.overdue && (
        <p className="bg-amber-100 px-4 py-2 text-sm text-amber-900 sm:px-8 lg:px-10 dark:bg-amber-950/60 dark:text-amber-200">
          The access review is due.{" "}
          <Link href="/admin/people/review" className="font-semibold underline">Start it</Link>
        </p>
      )}
    </header>
  );
}
