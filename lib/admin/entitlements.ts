import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanId } from "@/lib/entitlements/plans";
import { getEntitlementPeriod } from "@/lib/entitlements/period";
import { buildEntitlementsSnapshot, getUsageTotalForUser, type UserEntitlements } from "@/lib/entitlements/usage";

/**
 * Admin's per-user entitlement view. Deliberately built on the SAME
 * buildEntitlementsSnapshot() pure function that lib/entitlements/usage.ts's
 * getUserEntitlements() (the self-service, product-enforcement path) uses —
 * so "Admin says 7/10" and "backend enforcement sees 7/10" can never
 * diverge. Only the raw-data fetching differs: this uses
 * getUsageTotalForUser() (also admin-client-based) to total up an ARBITRARY
 * user's usage — appropriate here, an already-authorized admin operation
 * (see lib/admin/auth.ts's requireAdmin(), which every caller of this
 * module must have already passed).
 */
export async function getEntitlementsForUser(profile: {
  id: string;
  planId: PlanId;
  planChangedAt: string | null;
}): Promise<UserEntitlements> {
  const admin = createAdminClient();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);

  const [projectCountResult, aiActionsUsed, transcriptionSecondsUsed, providerCostUsed] = await Promise.all([
    // Only Projects this account OWNS count against its plan limit — see
    // the collaboration model's "shared Projects don't count against a
    // Member's limit" rule.
    admin.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", profile.id),
    getUsageTotalForUser(profile.id, "ai_action", period.start),
    getUsageTotalForUser(profile.id, "transcription_seconds", period.start),
    limits.apiCostBudgetUsd !== null
      ? getUsageTotalForUser(profile.id, "provider_cost", period.start)
      : Promise.resolve(null),
  ]);

  if (projectCountResult.error) throw projectCountResult.error;

  return buildEntitlementsSnapshot({
    plan: profile.planId,
    limits,
    periodEnd: period.end,
    projectCount: projectCountResult.count ?? 0,
    aiActionsUsed,
    transcriptionSecondsUsed,
    providerCostUsed,
  });
}
