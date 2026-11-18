"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@timesprime/ui/ThemeContext";
import { describeRoles } from "@timesprime/shared/lib/staffRoles";
import { useAdminMe } from "./desk/deskClient";

// The back office's own masthead, on every page: where to go, who is signed in and as what (the
// owner asked, 18 Nov 2026), signing out, and the theme. The reader site's header and ticker fetch
// the public feed, which this app does not serve.
export default function AdminTopBar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { me } = useAdminMe();
  const isDark = theme === "dark";

  const signOut = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } finally {
      router.push("/admin/login");
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white dark:border-[#2b2f36] dark:bg-[#202327]">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-8 lg:px-10">
        <div className="flex items-center gap-5">
          <span className="font-serif text-lg font-extrabold text-slate-900 dark:text-white">
            TimesPrime <span className="text-blue-600 dark:text-blue-400">Admin</span>
          </span>
          <nav aria-label="Back office" className="flex gap-3 text-sm font-semibold">
            <Link href="/admin" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">Dashboard</Link>
            <Link href="/admin/desk" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">Desk</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <p className="text-right text-xs">
              <span className="block font-semibold text-slate-900 dark:text-white">
                {me.kind === "staff" ? `Signed in as ${me.displayName}` : "Signed in with the shared admin password"}
              </span>
              {me.kind === "staff" && me.roles.length > 0 && <span className="block text-slate-500">{describeRoles(me.roles)}</span>}
            </p>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]"
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#2b2f36]"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
