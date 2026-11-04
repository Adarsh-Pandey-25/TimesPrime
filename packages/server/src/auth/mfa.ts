import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// The staff member's second factor, through Supabase Auth's MFA API (design §5). TOTP only: free,
// on by default. Calls are made with the per-request route client (supabaseServer.ts), so a
// successful verify writes the upgraded aal2 session back to the cookies. Every function here
// turns a Supabase error into a plain result; the routes decide what to answer.

export interface MfaState {
  /** A verified TOTP factor exists: the user signs in with a code. */
  enrolled: boolean;
  verifiedFactorId: string | null;
  /** Started but never confirmed enrolments, which a new enrolment replaces. */
  unverifiedFactorIds: string[];
}

interface Factor {
  id: string;
  factor_type?: string;
  status?: string;
}

export async function getMfaState(client: SupabaseClient): Promise<MfaState | null> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) return null;
  const all = ((data as { all?: Factor[] }).all ?? []).filter((f) => f.factor_type === "totp");
  const verified = all.find((f) => f.status === "verified");
  return {
    enrolled: Boolean(verified),
    verifiedFactorId: verified?.id ?? null,
    unverifiedFactorIds: all.filter((f) => f.status !== "verified").map((f) => f.id),
  };
}

export interface Enrolment {
  factorId: string;
  /** An image (SVG data URL) of the otpauth URI, to scan. */
  qrCode: string;
  /** The same secret as text, for typing in by hand. */
  secret: string;
}

/** Starts a TOTP enrolment, replacing any unconfirmed one. */
export async function enrollTotp(client: SupabaseClient, state: MfaState): Promise<Enrolment | null> {
  for (const id of state.unverifiedFactorIds) await client.auth.mfa.unenroll({ factorId: id });
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `TimesPrime admin ${Date.now()}` });
  if (error || !data || data.type !== "totp") return null;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Challenges and verifies one code. On success the session is aal2. */
export async function verifyTotp(client: SupabaseClient, factorId: string, code: string): Promise<boolean> {
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  return !error;
}
