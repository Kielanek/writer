import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminUserDetail } from "@/lib/admin/users";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserPlanSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * Manual plan override for testing — separate from (and more powerful than)
 * the self-service demo-upgrade endpoint (app/api/upgrade/demo-checkout),
 * which only ever allows an authenticated caller's own starter -> pro. This
 * route is reachable only after requireAdmin() and can set ANY plan
 * (including development) on ANY user — a normal user has no client-side
 * path to this at all (no Supabase grant lets them write profiles.plan_id
 * directly either).
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const admin = await requireAdmin();
  const { userId } = await params;

  const target = await getAdminUserDetail(userId);
  if (!target) throw new ApiError(404, "User not found.");

  const body = await request.json();
  const { planId } = setUserPlanSchema.parse(body);

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ plan_id: planId, plan_changed_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "user_plan_changed",
    metadata: {
      targetUserId: userId,
      before: { planId: target.planId },
      after: { planId },
    },
  });

  return NextResponse.json({ ok: true });
});
