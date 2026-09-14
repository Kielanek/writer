import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Reads an ARBITRARY user's profile — the admin/secret client, bypassing
 * `profiles_select_own` RLS, which only ever allows `id = auth.uid()`. This
 * exists for exactly one purpose: resolving a Project Owner's plan/limits
 * when a Member (not the Owner) is the one performing a project-scoped
 * action — see lib/entitlements/usage.ts's checkAiActionLimit() and
 * friends, and lib/ai/guarded.ts.
 *
 * SAFE to call with a caller-resolved id here ONLY because every call site
 * resolves `userId` from a trusted source (a Project row's `owner_id`,
 * fetched via getProject() — which is itself RLS-gated to the actor's own
 * accessible Projects) — never from raw, unverified client input. Do not
 * add a new call site that passes a client-supplied id straight through.
 */
export async function getProfileForUser(userId: string): Promise<UserProfile> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("plan_id, plan_changed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    id: userId,
    planId: (data?.plan_id as PlanId | undefined) ?? DEFAULT_PLAN_ID,
    planChangedAt: data?.plan_changed_at ?? null,
  };
}
