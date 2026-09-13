import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import { DEFAULT_PLAN_ID, type PlanId } from "@/lib/entitlements/plans";

/**
 * The current user's plan. Derives the user from the session itself
 * (never accepts a caller-supplied id) — consistent with every other
 * lib/db/*.ts function in this codebase.
 *
 * Falls back to the default plan if the profile row is somehow missing
 * (it shouldn't be — supabase/migrations/0007_usage_limits.sql creates one
 * for every signup via a trigger, and backfills existing accounts) rather
 * than failing every request for an account in that state.
 */
export async function getUserPlan(): Promise<PlanId> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("plan_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data?.plan_id as PlanId | undefined) ?? DEFAULT_PLAN_ID;
}
