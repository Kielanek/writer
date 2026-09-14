import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAllPlanConfigs, updatePlanConfig, type PlanConfig } from "@/lib/admin/planConfig";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { planConfigUpdateSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

export const GET = withApiErrorHandling(async () => {
  await requireAdmin();
  const configs = await getAllPlanConfigs();
  return NextResponse.json(configs);
});

/**
 * Starter/Pro limit changes apply immediately to every current account on
 * that plan — this is intentional (see the product spec): a plan's
 * remaining allowance is always `(current config limit) - (usage so far)`,
 * computed fresh on every check, never a value snapshotted at signup. No
 * cache to invalidate here, so "apply immediately" requires no extra
 * plumbing.
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin();

  const body = await request.json();
  const next: PlanConfig = planConfigUpdateSchema.parse(body);

  const before = await getAllPlanConfigs();
  await updatePlanConfig(next);

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "plan_config_updated",
    metadata: { planId: next.planId, before: before[next.planId], after: next },
  });

  return NextResponse.json(next);
});
