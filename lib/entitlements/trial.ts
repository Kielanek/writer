import "server-only";
import { TrialExpiredError } from "@/lib/entitlements/errors";
import type { UserProfile } from "@/lib/entitlements/profile";

/**
 * Centralized trial-status logic — do not scatter `now >= trial_ends_at`
 * comparisons through routes. Designed to be extended, not replaced, once
 * Stripe exists: a future status set (trialing/active/past_due/canceled)
 * slots in alongside "not_on_trial" without changing this function's
 * callers, only its return type.
 */
export type TrialStatus = "trialing" | "expired" | "not_on_trial";

export function getTrialStatus(
  profile: { planId: string; trialEndsAt: string | null },
  now: Date = new Date()
): TrialStatus {
  if (profile.planId !== "trial") return "not_on_trial";
  // No end date somehow set on a trial account: treat as still trialing
  // rather than blocking — this is an anomaly to fix in data, not a reason
  // to lock the user out.
  if (!profile.trialEndsAt) return "trialing";
  return now.getTime() < new Date(profile.trialEndsAt).getTime() ? "trialing" : "expired";
}

/**
 * Call at the top of every entitlement-gated action (AI operations, project
 * creation — see lib/ai/guarded.ts, lib/entitlements/usage.ts,
 * lib/db/projects.ts) BEFORE checking numeric limits or spending anything.
 * A no-op for non-trial accounts. Existing content (Projects, Notes,
 * Documents already created) remains fully readable regardless — this only
 * blocks NEW entitlement-gated actions.
 */
export function assertTrialActive(profile: UserProfile): void {
  if (getTrialStatus(profile) === "expired") {
    throw new TrialExpiredError();
  }
}
