import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { getUserProfile } from "@/lib/entitlements/profile";
import { applyPlanChange } from "@/lib/entitlements/planChange";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

/**
 * DEMO ONLY — no Stripe, no real payment processing, no card data of any
 * kind reaches this route (the client sends an empty body). See
 * components/upgrade/demo-checkout.tsx for the "no real payment will be
 * processed" UI this backs.
 *
 * Security (see the product spec's Upgrade Security section):
 * - requireUser() rejects unauthenticated calls.
 * - The acting user is ALWAYS derived from the session, never from the
 *   request body — there is no userId field this endpoint reads at all.
 * - Only starter -> pro is allowed; a non-Starter caller (including an
 *   already-Pro or Development account) gets a 400, never a plan change.
 *   This is the only plan value this route can ever write — there is no way
 *   to reach "development" through it.
 * - The actual mutation goes through applyPlanChange() (the same boundary a
 *   future Stripe webhook will call), which also writes the plan_change_audit
 *   row — no card values are stored anywhere, because none were ever sent.
 */
export const POST = withApiErrorHandling(async () => {
  const user = await requireUser();
  const profile = await getUserProfile();

  if (profile.planId !== "starter") {
    throw new ApiError(400, "Only Starter accounts can upgrade through the demo checkout.");
  }

  await applyPlanChange({ userId: user.id, fromPlan: "starter", toPlan: "pro", source: "demo_checkout" });

  return NextResponse.json({ ok: true, plan: "pro" });
});
