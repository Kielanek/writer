/**
 * Centralized plan configuration. This is the ONLY place product limits are
 * defined — never hardcode a limit check (e.g. `if (count > 100)`) anywhere
 * else in the app. A future Stripe integration maps subscription price IDs
 * to a `PlanId` here; nothing downstream (entitlements, usage checks, the
 * UI) needs to change.
 */
export type PlanId = "development" | "trial" | "pro";

export interface PlanLimits {
  /** Total Projects a user may own at once (not a monthly quota). */
  maxProjects: number;
  /** User-initiated AI operations per calendar month — see lib/entitlements/usage.ts. */
  aiActionsPerMonth: number;
  /** Transcription allowance per calendar month, in minutes (tracked internally in seconds). */
  transcriptionMinutesPerMonth: number;
  /**
   * Hard INTERNAL safety cap on real OpenAI provider cost (see
   * lib/entitlements/cost.ts and lib/entitlements/reservation.ts) —
   * completely independent of the product-facing limits above, and never
   * shown to the user (see the Account/Usage UI, which never renders this
   * field). `null` means no application-level cost cap is enforced for
   * this plan — used for development/pro today, since abuse there is not a
   * real-world concern the way an anonymous trial signup is.
   */
  apiCostBudgetUsd: number | null;
}

/**
 * These are temporary, deliberately generous development limits — NOT final
 * commercial pricing. Change freely; nothing else needs to change alongside
 * them.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  development: {
    maxProjects: 50,
    aiActionsPerMonth: 1000,
    transcriptionMinutesPerMonth: 1000,
    apiCostBudgetUsd: null,
  },
  /**
   * The eventual free-trial plan (assigned automatically once Stripe/trial
   * signup exists — for now, assign manually via
   * `npm run set-user-plan -- <uuid> trial`, see scripts/set-user-plan.ts).
   * `apiCostBudgetUsd` is the real, business-critical number here: it
   * exists to guarantee a trial account can never cost more than roughly
   * $0.50 in actual OpenAI spend, regardless of how the product-facing
   * limits below are tuned.
   */
  trial: {
    maxProjects: 3,
    aiActionsPerMonth: 10,
    transcriptionMinutesPerMonth: 120,
    apiCostBudgetUsd: 0.5,
  },
  pro: {
    maxProjects: 200,
    aiActionsPerMonth: 5000,
    transcriptionMinutesPerMonth: 5000,
    apiCostBudgetUsd: null,
  },
};

/** Every new signup starts here (see supabase/migrations/0007_usage_limits.sql's handle_new_user trigger). */
export const DEFAULT_PLAN_ID: PlanId = "development";

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLAN_LIMITS[planId] ?? PLAN_LIMITS[DEFAULT_PLAN_ID];
}
