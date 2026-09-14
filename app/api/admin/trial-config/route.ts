import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getTrialConfig, updateTrialConfig } from "@/lib/admin/planConfig";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { trialConfigSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

export const GET = withApiErrorHandling(async () => {
  await requireAdmin();
  const config = await getTrialConfig();
  return NextResponse.json(config);
});

/**
 * Trial limit changes apply immediately to every current trial account —
 * this is intentional (see the product spec): a running trial's remaining
 * allowance is always `(current config limit) - (usage so far)`, computed
 * fresh on every check, never a value snapshotted at signup. No cache to
 * invalidate here, so "apply immediately" requires no extra plumbing.
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin();

  const body = await request.json();
  const next = trialConfigSchema.parse(body);

  const before = await getTrialConfig();
  await updateTrialConfig(next);

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "trial_config_updated",
    metadata: { before, after: next },
  });

  return NextResponse.json(next);
});
