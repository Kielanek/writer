import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";

/**
 * Centralized plan configuration. This is the ONLY place product limits are
 * defined — never hardcode a limit check (e.g. `if (count > 100)`) anywhere
 * else in the app. A future Stripe integration maps subscription price IDs
 * to a `PlanId` here; nothing downstream (entitlements, usage checks, the
 * UI) needs to change.
 *
 * Two sources, by design (see /admin's Trial Settings section):
 * - `trial` is DB-backed (the `plan_configs` table, edited only through
 *   the Admin Panel) — trial limits must be changeable without a deploy.
 * - `development`/`pro` stay code-defined below — they're
 *   developer-controlled, not admin-editable product limits, and keeping
 *   them in code means local development is never blocked by (or
 *   dependent on) a database row existing.
 */
export type PlanId = "development" | "trial" | "pro";

export interface PlanLimits {
  /** Total Projects a user may own at once (not a monthly quota). */
  maxProjects: number;
  /** User-initiated AI operations per period — see lib/entitlements/period.ts's getEntitlementPeriod. */
  aiActionsPerMonth: number;
  /** Transcription allowance per period, in minutes (tracked internally in seconds). */
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
 * Code-defined limits for the plans that are NOT admin-editable, plus a
 * hardcoded trial fallback used only if the `plan_configs` DB row is ever
 * missing (defensive — should not happen once 0010_admin_trial_config.sql
 * has run; see getPlanLimits() below). These are temporary, deliberately
 * generous development limits — NOT final commercial pricing.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  development: {
    maxProjects: 50,
    aiActionsPerMonth: 1000,
    transcriptionMinutesPerMonth: 1000,
    apiCostBudgetUsd: null,
  },
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

/** Safety-net fallback only (see lib/entitlements/profile.ts's getUserProfile doc comment) — NOT what new signups get; that's the DB trigger's job. */
export const DEFAULT_PLAN_ID: PlanId = "development";

/**
 * Resolves a plan's limits. For `trial`, reads the live `plan_configs` row
 * (see supabase/migrations/0010_admin_trial_config.sql) via the ordinary
 * session client — these numbers aren't sensitive (the trial UI already
 * shows them), so no admin/service-role client is needed just to read
 * them; only the Admin Panel's write path needs elevated access. Falls
 * back to the code-defined PLAN_LIMITS.trial (logged) if that row is ever
 * missing, so a bad migration state degrades gracefully instead of
 * breaking every trial request.
 */
export async function getPlanLimits(planId: PlanId): Promise<PlanLimits> {
  if (planId !== "trial") {
    return PLAN_LIMITS[planId] ?? PLAN_LIMITS[DEFAULT_PLAN_ID];
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("plan_configs")
    .select("max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd")
    .eq("plan_id", "trial")
    .maybeSingle();

  if (error) {
    console.error("[plan-config] failed to read trial plan_configs row, using code fallback:", error);
    return PLAN_LIMITS.trial;
  }
  if (!data) {
    console.error("[plan-config] trial plan_configs row is missing, using code fallback");
    return PLAN_LIMITS.trial;
  }

  return {
    maxProjects: data.max_projects,
    aiActionsPerMonth: data.ai_actions_limit,
    transcriptionMinutesPerMonth: Number(data.transcription_minutes_limit),
    apiCostBudgetUsd: data.api_cost_budget_usd === null ? null : Number(data.api_cost_budget_usd),
  };
}
