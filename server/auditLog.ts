import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import type { AdminAction } from "@/shared/types";

/**
 * Records an admin action to the admin_logs table for the Activity Log.
 * Deliberately swallows every failure (missing table, network error,
 * misconfiguration) — logging is observability, not a critical path, and
 * must never be the reason a real admin action (delete/edit/publish/etc.)
 * fails or throws. Callers should still `await` this so it actually
 * completes before a serverless function's response is sent, rather than
 * risking the invocation being frozen mid-write.
 */
export async function logAdminAction(
  action: AdminAction,
  details: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;

    const { error } = await supabase.from("admin_logs").insert([{ action, details, metadata }]);

    if (error) {
      console.error("Admin log insert error:", error.message);
      Sentry.captureMessage(`Admin log insert error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "logAdminAction", action },
      });
    }
  } catch (err) {
    console.error("Admin log insert error:", err);
    Sentry.captureException(err, {
      tags: { source: "supabase" },
      extra: { operation: "logAdminAction", action },
    });
  }
}
