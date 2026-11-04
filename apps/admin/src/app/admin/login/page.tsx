"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle, KeyRound } from "lucide-react";
import { useTheme } from "@timesprime/ui/ThemeContext";
import type { AdminMe } from "@timesprime/shared/types";

// Sign-in (Panel 0). A staff account signs in with email and password, then the second factor:
// set up the first time (QR code and secret, then one code), a code every time after. The shared
// admin password stays one click away until it is retired, so no one is locked out while staff
// accounts are set up. Every step is decided by the server (/api/admin/login, /api/admin/mfa); this
// page only follows the answers.

type Step = "staff" | "legacy" | "code" | "enroll";

interface Enrolment {
  factorId: string;
  qrCode: string;
  secret: string;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: (data ?? {}) as Record<string, unknown> };
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [step, setStep] = useState<Step>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fieldClass = `w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
    isDark ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500" : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
  }`;
  const labelClass = "block text-xs font-semibold text-slate-600 dark:text-slate-400";
  const linkClass = "w-full text-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline";

  const done = () => {
    router.push("/admin");
    router.refresh();
  };

  const startEnrolment = async () => {
    const res = await post("/api/admin/mfa", { action: "enroll" });
    if (!res.ok) {
      setError(String(res.data.error || "Could not start the set-up."));
      return;
    }
    setEnrolment(res.data as unknown as Enrolment);
    setStep("enroll");
  };

  // A session that signed in but still owes its code (for example, sent back here from /admin)
  // goes straight to the code step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" });
        if (cancelled || !res.ok) return;
        const me = (await res.json()) as AdminMe;
        if (cancelled || me.kind !== "staff" || me.aal !== "aal1" || !me.mfa.required) return;
        if (me.mfa.enrolled) setStep("code");
        else await startEnrolment();
      } catch {
        // Not signed in yet: the sign-in form is already showing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = (action: () => Promise<void>) => async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await action();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const signInStaff = run(async () => {
    const res = await post("/api/admin/login", { email, password });
    if (!res.ok) {
      setError(String(res.data.error || "Login failed."));
      return;
    }
    setPassword("");
    if (res.data.next === "mfa_verify") setStep("code");
    else if (res.data.next === "mfa_enroll") await startEnrolment();
    else done();
  });

  const signInLegacy = run(async () => {
    const res = await post("/api/admin/login", { password });
    if (!res.ok) {
      setError(String(res.data.error || "Login failed."));
      return;
    }
    done();
  });

  const verify = run(async () => {
    const body = step === "enroll" && enrolment ? { action: "verify", code, factorId: enrolment.factorId } : { action: "verify", code };
    const res = await post("/api/admin/mfa", body);
    if (!res.ok) {
      setError(String(res.data.error || "Verification failed."));
      setCode("");
      return;
    }
    done();
  });

  const submitButton = (idle: string, busy: string) => (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? busy : idle}
    </button>
  );

  const switchTo = (next: Step) => () => {
    setError("");
    setPassword("");
    setStep(next);
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
            {step === "code" || step === "enroll" ? <KeyRound className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <h1 className="font-serif text-xl font-extrabold">
            {step === "enroll" ? "Set up your second factor" : step === "code" ? "Enter your code" : "Admin Login"}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {step === "enroll"
              ? "Scan the QR code with an authenticator app, then enter the 6-digit code it shows."
              : step === "code"
                ? "Enter the 6-digit code from your authenticator app."
                : step === "legacy"
                  ? "The shared admin password. It is being retired; use a staff account when you have one."
                  : "Sign in with your staff account to access the TimesPrime admin panel."}
          </p>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "staff" && (
          <form onSubmit={signInStaff} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-email" className={labelClass}>Email</label>
              <input id="admin-email" type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="admin-password" className={labelClass}>Password</label>
              <input id="admin-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} />
            </div>
            {submitButton("Sign In", "Signing in...")}
            <button type="button" onClick={switchTo("legacy")} className={linkClass}>
              Use the shared admin password
            </button>
          </form>
        )}

        {step === "legacy" && (
          <form onSubmit={signInLegacy} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-shared-password" className={labelClass}>Shared password</label>
              <input id="admin-shared-password" type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} />
            </div>
            {submitButton("Sign In", "Signing in...")}
            <button type="button" onClick={switchTo("staff")} className={linkClass}>
              Use a staff account
            </button>
          </form>
        )}

        {(step === "code" || step === "enroll") && (
          <form onSubmit={verify} className="space-y-4">
            {step === "enroll" && enrolment && (
              <div className="flex flex-col items-center space-y-2">
                {/* The QR code is a data: URL from Supabase. next/image cannot optimize one (it
                    needs unoptimized) and measured +19,359 bytes on this page, so a plain img. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrolment.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg bg-white p-2" />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Or type this key into the app:</p>
                <code className="break-all rounded-lg bg-slate-100 dark:bg-slate-900 px-2 py-1 text-xs font-bold">{enrolment.secret}</code>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="admin-code" className={labelClass}>Authenticator code</label>
              <input
                id="admin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${fieldClass} tracking-[0.4em] text-center`}
              />
            </div>
            {submitButton("Verify", "Verifying...")}
          </form>
        )}
      </div>
    </div>
  );
}
