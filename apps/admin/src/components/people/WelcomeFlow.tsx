"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LINK_VALID_FOR, PASSWORD_MIN, passwordProblem } from "@timesprime/shared/config/people";
import { KeyRound } from "lucide-react";
import { deskCall } from "../desk/deskClient";
import PasswordInput from "../ui/PasswordInput";
import { authCard, authIcon, authPage, buttonBlock, fieldLarge } from "../ui/styles";

// Where a one-time "set your password" link lands (Panel 1 design §4, M2b). The token is taken out
// of the address bar at once, then sent once to POST /api/admin/welcome, which makes a session. If
// the account already has a second factor, its code comes first (POST /api/admin/mfa), so a link
// alone does not take over an account. Then a password (POST /api/admin/password), after which every
// session ends and the person signs in, setting up their second factor there if they have none.
// Every step is the server's; this page follows the answers.

type Step = "checking" | "invalid" | "code" | "password" | "done";

// The same card, fields and button as the sign-in page (components/ui/styles.ts).
const field = `${fieldLarge} mt-1 font-medium`;
const primary = buttonBlock;

export default function WelcomeFlow() {
  const [step, setStep] = useState<Step>("checking");
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // A token works once: React may run an effect twice while developing, so it is sent only once.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token_hash");
    const type = params.get("type");
    // Out of the address bar and the history at once: the link is a credential.
    window.history.replaceState(null, "", "/admin/welcome");
    if (!token || type !== "recovery") {
      // Necessary setState-in-effect: the token is in the address, which exists only in the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("This link is not complete. Open the whole link you were given, or ask your admin for a new one.");
      setStep("invalid");
      return;
    }
    void (async () => {
      const res = await deskCall<{ name: string; email: string | null; hasFactor: boolean }>("/api/admin/welcome", {
        method: "POST",
        body: JSON.stringify({ token_hash: token, type }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "This link does not work any more. Ask your admin for a new one.");
        setStep("invalid");
        return;
      }
      setName(res.data.name);
      setEmail(res.data.email);
      setStep(res.data.hasFactor ? "code" : "password");
    })();
  }, []);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await deskCall("/api/admin/mfa", { method: "POST", body: JSON.stringify({ action: "verify", code }) });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "That code is not right.");
    setError("");
    setStep("password");
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, email);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords are not the same.");
    setBusy(true);
    const res = await deskCall<{ code?: string }>("/api/admin/password", { method: "POST", body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.status === 403 && (res.data as { code?: string } | null)?.code === "mfa_required") {
      setError("Enter the code from your authenticator app first.");
      return setStep("code");
    }
    if (!res.ok) return setError(res.error ?? "The password was not set.");
    setError("");
    setPassword("");
    setConfirm("");
    setStep("done");
  }

  const title: Record<Step, string> = {
    checking: "Opening your link…",
    invalid: "This link does not work",
    code: "Enter your code",
    password: "Choose your password",
    done: "Your password is set",
  };

  return (
    <div className={authPage}>
      <p className="font-serif text-lg font-extrabold">
        TimesPrime <span className="text-blue-600 dark:text-blue-400">Admin</span>
      </p>
      <main className={authCard}>
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className={authIcon}>
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-xl font-extrabold">{title[step]}</h1>
          {name && step !== "invalid" && <p className="text-sm text-slate-600 dark:text-slate-300">Welcome to TimesPrime, {name}.</p>}
        </div>

        {step === "checking" && <p aria-live="polite" className="text-center text-sm text-slate-500">Checking the link…</p>}

        {error && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {step === "invalid" && (
          <p className="text-center text-xs text-slate-500">
            A link works once, for {LINK_VALID_FOR}. <Link href="/admin/login" className="font-semibold text-blue-700 dark:text-blue-300">Go to sign-in</Link>
          </p>
        )}

        {step === "code" && (
          <form onSubmit={(e) => void submitCode(e)} className="space-y-4">
            <p className="text-xs text-slate-500">Your account has a second factor: enter the 6-digit code from your authenticator app (TimesPrime) before choosing a new password.</p>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Code
              <input className={field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
            <button type="submit" className={primary} disabled={busy || code.length !== 6}>Continue</button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={(e) => void submitPassword(e)} className="space-y-4">
            <p className="text-xs text-slate-500">At least {PASSWORD_MIN} characters. A few words you will remember work well.</p>
            {/* Each field's label points to it, so the eye button beside it is not part of its name. */}
            <div>
              <label htmlFor="welcome-password" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">New password</label>
              <PasswordInput id="welcome-password" className={field.replace(" mt-1", "")} wrapperClassName="mt-1" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label htmlFor="welcome-confirm" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">The same password again</label>
              <PasswordInput id="welcome-confirm" className={field.replace(" mt-1", "")} wrapperClassName="mt-1" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button type="submit" className={primary} disabled={busy || !password || !confirm}>Set my password</button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center text-sm">
            <p>Sign in with your email and the new password. If this is your first time, you will set up your authenticator app there.</p>
            <Link href="/admin/login" className={`${primary} flex`}>Go to sign-in</Link>
          </div>
        )}
      </main>
    </div>
  );
}
