"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 transition-colors duration-200 ${
        isDark ? "bg-[#1a1c1e] text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border p-8 shadow-sm space-y-6 ${
          isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600/10 text-red-600 border border-red-600/20">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-xl font-extrabold">Admin Login</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sign in to access the TimesPrime admin panel.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Password
            </label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
