import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import { DEFAULT_PLAN_ID, type PlanId } from "@/lib/entitlements/plans";

export interface UserProfile {
  id: string;
  planId: PlanId;
  /** When this account's plan last changed (set by applyPlanChange()). Null for accounts that have never changed plan (e.g. every Starter signup, until it upgrades). Drives Pro's monthly-period floor — see lib/entitlements/period.ts. */
  planChangedAt: string | null;
}

/**
 * The current user's full profile, derived from the session itself (never a
 * caller-supplied id) — consistent with every other lib/db/*.ts function in
 * this codebase.
 *
 * Falls back to DEFAULT_PLAN_ID ("development", not "starter") with no
 * plan-change date if the profile row is somehow missing. This is a
 * defensive safety net for an anomalous state, not what new signups actually
 * get — see supabase/migrations/0014_starter_pro_plans.sql's
 * handle_new_user() trigger, which is the real source of "new accounts start
 * on Starter."
 */
export async function getUserProfile(): Promise<UserProfile> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("plan_id, plan_changed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    id: user.id,
    planId: (data?.plan_id as PlanId | undefined) ?? DEFAULT_PLAN_ID,
    planChangedAt: data?.plan_changed_at ?? null,
  };
}

/** Thin convenience wrapper for the many callers that only need the plan id. */
export async function getUserPlan(): Promise<PlanId> {
  return (await getUserProfile()).planId;
}
