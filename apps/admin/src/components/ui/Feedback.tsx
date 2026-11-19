"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { button, buttonDangerSolid, buttonPrimary, field } from "./styles";

// The back office's popups, in place of the browser's own confirm, prompt and alert boxes
// ("localhost:3001 says…"): a dialog that asks before an action or for a few values, and short
// messages ("toasts") in a corner after an action worked. One provider in the root layout serves
// every screen (Next's guide: a Client Component provider around `children`).
//
// The dialog is the browser's <dialog>, opened modally: it keeps the keyboard inside it, Escape
// closes it as a "no", and focus goes back where it was. A toast is announced by screen readers
// (aria-live) and stays while the pointer is on it. Without the provider (a component rendered
// alone, as in its unit tests) the hooks fall back to the browser's boxes and to inline messages,
// so nothing is lost.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for an action that takes something away: the confirming button is red. */
  tone?: "default" | "danger";
}

export interface FormField {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
}

export interface FormOptions {
  title: string;
  message?: string;
  fields: FormField[];
  submitLabel?: string;
  /** A problem to show in the dialog, which then stays open; null when the values are fine. */
  validate?: (values: Record<string, string>) => string | null;
}

export interface Dialogs {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** The values typed, or null when the person cancelled. */
  form: (options: FormOptions) => Promise<Record<string, string> | null>;
}

export interface Toasts {
  show: (text: string, tone?: "success" | "error") => void;
}

const DialogContext = createContext<Dialogs | null>(null);
const ToastContext = createContext<Toasts | null>(null);

/** Without the provider: the browser's own boxes, as before. */
const browserDialogs: Dialogs = {
  confirm: async ({ title, message }) => window.confirm(message ? `${title}\n\n${message}` : title),
  form: async ({ fields, validate }) => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const answer = window.prompt(f.label, f.defaultValue ?? "");
      if (answer === null) return null;
      values[f.name] = answer;
    }
    const problem = validate?.(values) ?? null;
    if (problem) {
      window.alert(problem);
      return null;
    }
    return values;
  },
};

export function useDialog(): Dialogs {
  return useContext(DialogContext) ?? browserDialogs;
}

/** Null without the provider: the caller then shows its message inline. */
export function useToast(): Toasts | null {
  return useContext(ToastContext);
}

type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "form"; options: FormOptions; resolve: (values: Record<string, string> | null) => void };

interface Toast {
  id: number;
  text: string;
  tone: "success" | "error";
}

/** Long enough to read: 5 seconds, plus a little per word for a longer message, at most 12. */
const toastMs = (text: string) => Math.min(12_000, 5_000 + text.split(/\s+/).length * 150);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dialogs = useMemo<Dialogs>(() => {
    // One dialog at a time: a new one answers the one still open with a "no".
    const replace = (next: Request) =>
      setRequest((open) => {
        if (open?.kind === "confirm") open.resolve(false);
        else if (open) open.resolve(null);
        return next;
      });
    return {
      confirm: (options) => new Promise<boolean>((resolve) => replace({ id: nextId.current++, kind: "confirm", options, resolve })),
      form: (options) =>
        new Promise<Record<string, string> | null>((resolve) => replace({ id: nextId.current++, kind: "form", options, resolve })),
    };
  }, []);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toastApi = useMemo<Toasts>(
    () => ({
      show: (text, tone = "success") => {
        const id = nextId.current++;
        // At most three at once: the oldest goes first.
        setToasts((all) => [...all.slice(-2), { id, text, tone }]);
      },
    }),
    [],
  );

  const settle = useCallback(
    (answer: boolean | Record<string, string> | null) => {
      if (!request) return;
      if (request.kind === "confirm") request.resolve(answer === true);
      else request.resolve(answer && typeof answer === "object" ? answer : null);
      setRequest(null);
    },
    [request],
  );

  return (
    <DialogContext.Provider value={dialogs}>
      <ToastContext.Provider value={toastApi}>
        {children}
        {request && <Dialog key={request.id} request={request} settle={settle} />}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} dismiss={dismiss} />
          ))}
        </div>
      </ToastContext.Provider>
    </DialogContext.Provider>
  );
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toastMs(toast.text));
    return () => window.clearTimeout(timer);
  }, [paused, toast, dismiss]);

  const ok = toast.tone === "success";
  return (
    <div
      role={ok ? "status" : "alert"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-white p-3 text-sm shadow-lg dark:bg-[#202327] ${
        ok ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"
      }`}
    >
      {ok ? (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <p className="flex-1 text-slate-800 dark:text-slate-100">{toast.text}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
        className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#2b2f36] dark:hover:text-slate-200"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function Dialog({ request, settle }: { request: Request; settle: (answer: boolean | Record<string, string> | null) => void }) {
  const { options } = request;
  const titleId = "feedback-dialog-title";
  const [values, setValues] = useState<Record<string, string>>(() =>
    request.kind === "form" ? Object.fromEntries(request.options.fields.map((f) => [f.name, f.defaultValue ?? ""])) : {},
  );
  const [problem, setProblem] = useState<string | null>(null);

  // Open it modally once it is in the page. jsdom (the unit tests) has no showModal: there it is
  // simply open.
  const open = useCallback((el: HTMLDialogElement | null) => {
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }, []);

  const danger = request.kind === "confirm" && request.options.tone === "danger";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (request.kind === "confirm") return settle(true);
    const found = request.options.validate?.(values) ?? null;
    if (found) return setProblem(found);
    settle(values);
  }

  return (
    <dialog
      ref={open}
      aria-labelledby={titleId}
      // Escape: the browser cancels the dialog; that is a "no".
      onCancel={(e) => {
        e.preventDefault();
        settle(request.kind === "confirm" ? false : null);
      }}
      // A click on the dimmed backdrop (the dialog itself, outside its panel) is a "no" too.
      onClick={(e) => {
        if (e.target === e.currentTarget) settle(request.kind === "confirm" ? false : null);
      }}
      className="animate-pop-in m-auto w-[min(92vw,28rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px] dark:border-[#2b2f36] dark:bg-[#202327] dark:text-slate-100"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            </span>
          )}
          <div className="space-y-1">
            <h2 id={titleId} className="font-serif text-lg font-bold">{options.title}</h2>
            {options.message && <p className="text-sm text-slate-600 dark:text-slate-300">{options.message}</p>}
          </div>
        </div>

        {request.kind === "form" &&
          request.options.fields.map((f, i) => (
            <label key={f.name} className="block text-sm font-semibold">
              {f.label}
              <input
                className={`${field} mt-1 font-normal`}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                // The first field takes the keyboard when the dialog opens.
                autoFocus={i === 0}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setProblem(null);
                }}
              />
              {f.hint && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{f.hint}</span>}
            </label>
          ))}

        {problem && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {problem}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className={button} onClick={() => settle(request.kind === "confirm" ? false : null)} autoFocus={danger}>
            {request.kind === "confirm" ? (request.options.cancelLabel ?? "Cancel") : "Cancel"}
          </button>
          <button type="submit" className={danger ? buttonDangerSolid : buttonPrimary} autoFocus={request.kind === "confirm" && !danger}>
            {request.kind === "confirm" ? (request.options.confirmLabel ?? "OK") : (request.options.submitLabel ?? "OK")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
