"use client";

import { useEffect, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useToast } from "./Feedback";

export interface Message {
  ok: boolean;
  text: string;
}

/**
 * What an action answered. Success becomes a toast in the corner, so the screen does not jump; a
 * refusal or failure stays here, beside the form, until the person acts again, so it is never
 * missed. With extra content (a link to follow), or without the toast provider, success stays
 * here too.
 */
export default function ActionMessage({ message, children }: { message: Message | null; children?: ReactNode }) {
  const toast = useToast();
  const asToast = Boolean(message?.ok && toast && !children);

  useEffect(() => {
    if (message && asToast) toast?.show(message.text, "success");
    // A new message object is a new answer, even with the same words.
  }, [message, asToast, toast]);

  if (!message || asToast) return null;
  if (message.ok) {
    return (
      <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
        {message.text}
        {children ? <> {children}</> : null}
      </p>
    );
  }
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {message.text}
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}
