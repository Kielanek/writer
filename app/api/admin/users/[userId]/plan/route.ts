import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminUserDetail } from "@/lib/admin/users";
import { getTrialConfig } from "@/lib/admin/planConfig";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserPlanSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * Manual plan override for testing — NOT a general plan editor (see the
 * product spec: only trial/development are supported here; paid plans
 * come with Stripe later). Server-only, audited, and only reachable after
 * requireAdmin() — a normal user has no client-side path to this at all
 * (no Supabase grant lets them write profiles.plan_id directly either).
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const admin = await requireAdmin();
  const { userId } = await params;

  const target = await getAdminUserDetail(userId);
  if (!target) throw new ApiError(404, "User not found.");

  const body = await request.json();
  const { planId } = setUserPlanSchema.parse(body);

  const update: { plan_id: string; trial_started_at: string | null; trial_ends_at: string | null } = {
    plan_id: planId,
    trial_started_at: null,
    trial_ends_at: null,
  };

  if (planId === "trial") {
    const { trialDays } = await getTrialConfig();
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    update.trial_started_at = startedAt.toISOString();
    update.trial_ends_at = endsAt.toISOString();
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
  if (error) throw error;

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "user_plan_changed",
    metadata: {
      targetUserId: userId,
      before: { planId: target.planId, trialStartedAt: target.trialStartedAt, trialEndsAt: target.trialEndsAt },
      after: { planId, trialStartedAt: update.trial_started_at, trialEndsAt: update.trial_ends_at },
    },
  });

  return NextResponse.json({ ok: true });
});
