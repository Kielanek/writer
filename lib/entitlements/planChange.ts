import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/entitlements/plans";

/**
 * The single service boundary for changing a user's plan. Today, the only
 * caller is the demo-checkout route (app/api/upgrade/demo-checkout/route.ts)
 * — a real Stripe webhook later calls this exact same function instead of
 * touching `profiles` directly, so nothing about Starter/Pro limits, the
 * entitlement engine, the Account UI, or Admin needs to change when Stripe
 * arrives.
 *
 * Always uses the admin/secret client: `authenticated` has zero write grant
 * on `profiles` or `plan_change_audit` (see the migrations), by design —
 * this is the only trusted path. Callers are responsible for verifying WHO
 * is allowed to request WHICH transition (e.g. the demo route only allows
 * the authenticated caller's own starter -> pro) before calling this; this
 * function itself does not re-check that, matching the codebase's existing
 * convention (recordAdminAudit et al.) that admin-client writes happen only
 * from already-authorized call sites.
 */
export async function applyPlanChange(input: {
  userId: string;
  fromPlan: PlanId;
  toPlan: PlanId;
  source: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ plan_id: input.toPlan, plan_changed_at: new Date().toISOString() })
    .eq("id", input.userId);

  if (error) throw error;

  // Best-effort by design, same as lib/admin/auditLog.ts's recordAdminAudit:
  // a logging failure must never mask (or roll back) the plan change that
  // already succeeded.
  try {
    const { error: auditError } = await admin.from("plan_change_audit").insert({
      user_id: input.userId,
      from_plan: input.fromPlan,
      to_plan: input.toPlan,
      source: input.source,
    });
    if (auditError) throw auditError;
  } catch (err) {
    console.error("[plan-change] failed to write plan_change_audit entry:", err);
  }
}
