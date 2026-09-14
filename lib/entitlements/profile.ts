import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import { DEFAULT_PLAN_ID, type PlanId } from "@/lib/entitlements/plans";

export interface UserProfile {
  id: string;
  planId: PlanId;
  /** Null for accounts with no trial period (development/pro, or any account created before trial dates existed). */
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

/**
 * The current user's full profile, derived from the session itself (never
 * a caller-supplied id) — consistent with every other lib/db/*.ts function
 * in this codebase.
 *
 * Falls back to DEFAULT_PLAN_ID ("development", not "trial") with null
 * trial dates if the profile row is somehow missing. This is a defensive
 * safety net for an anomalous state, not what new signups actually get —
 * see supabase/migrations/0010_admin_trial_config.sql's handle_new_user()
 * trigger, which is the real source of "new accounts start on trial."
 * Falling back to "development" here (rather than "trial" with no trial
 * dates) avoids nonsensical period math for an account that has no
 * trial_started_at/trial_ends_at to speak of.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("plan_id, trial_started_at, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    id: user.id,
    planId: (data?.plan_id as PlanId | undefined) ?? DEFAULT_PLAN_ID,
    trialStartedAt: data?.trial_started_at ?? null,
    trialEndsAt: data?.trial_ends_at ?? null,
  };
}

/** Thin convenience wrapper for the many callers that only need the plan id. */
export async function getUserPlan(): Promise<PlanId> {
  return (await getUserProfile()).planId;
}
