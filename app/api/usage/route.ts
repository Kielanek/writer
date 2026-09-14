import { NextResponse } from "next/server";
import { getUserEntitlements } from "@/lib/entitlements/usage";
import { withApiErrorHandling } from "@/lib/utils/api";

/**
 * Powers the account Usage panel. requireUser() (inside getUserEntitlements)
 * rejects unauthenticated calls with 401.
 *
 * `providerCost` is deliberately stripped before responding — it's real
 * internal OpenAI spend accounting (see lib/entitlements/plans.ts's
 * apiCostBudgetUsd doc comment) and must never reach the browser, even
 * though getUserEntitlements() computes it for server-side use.
 */
export const GET = withApiErrorHandling(async () => {
  const entitlements = await getUserEntitlements();
  return NextResponse.json({
    plan: entitlements.plan,
    planDisplayName: entitlements.planDisplayName,
    usagePeriod: entitlements.usagePeriod,
    projects: entitlements.projects,
    aiActions: entitlements.aiActions,
    transcriptionMinutes: entitlements.transcriptionMinutes,
  });
});
