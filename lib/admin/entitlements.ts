import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanId } from "@/lib/entitlements/plans";
import { getEntitlementPeriod } from "@/lib/entitlements/period";
import { getTrialStatus } from "@/lib/entitlements/trial";
import { buildEntitlementsSnapshot, type UsageEventType, type UserEntitlements } from "@/lib/entitlements/usage";

/**
 * Admin's per-user entitlement view. Deliberately built on the SAME
 * buildEntitlementsSnapshot() pure function that lib/entitlements/usage.ts's
 * getUserEntitlements() (the self-service, product-enforcement path) uses —
 * so "Admin says 7/10" and "backend enforcement sees 7/10" can never
 * diverge. Only the raw-data fetching differs: this uses the admin/secret
 * client to total up an ARBITRARY user's usage (appropriate here — an
 * already-authorized admin operation, not ordinary user CRUD; see
 * lib/admin/auth.ts's requireAdmin(), which every caller of this module
 * must have already passed), since the session-scoped RPCs
 * (get_usage_total, get_provider_cost_total) are intentionally hardcoded
 * to `auth.uid()` and can't target another user at all.
 */

async function sumUsageForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  eventType: UsageEventType,
  periodStart: Date
): Promise<number> {
  const { data, error } = await admin
    .from("usage_events")
    .select("quantity")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .gte("created_at", periodStart.toISOString());

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
}

export async function getEntitlementsForUser(profile: {
  id: string;
  planId: PlanId;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}): Promise<UserEntitlements> {
  const admin = createAdminClient();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);

  const [projectCountResult, aiActionsUsed, transcriptionSecondsUsed, providerCostUsed] = await Promise.all([
    admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    sumUsageForUser(admin, profile.id, "ai_action", period.start),
    sumUsageForUser(admin, profile.id, "transcription_seconds", period.start),
    limits.apiCostBudgetUsd !== null
      ? sumUsageForUser(admin, profile.id, "provider_cost", period.start)
      : Promise.resolve(null),
  ]);

  if (projectCountResult.error) throw projectCountResult.error;

  return buildEntitlementsSnapshot({
    plan: profile.planId,
    limits,
    trialStatus: getTrialStatus(profile),
    trialEndsAt: profile.trialEndsAt,
    periodEnd: period.end,
    projectCount: projectCountResult.count ?? 0,
    aiActionsUsed,
    transcriptionSecondsUsed,
    providerCostUsed,
  });
}
