import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";

/**
 * Centralized plan configuration. This is the ONLY place product limits are
 * defined — never hardcode a limit check (e.g. `if (count > 100)`) anywhere
 * else in the app. A future Stripe integration maps subscription price IDs
 * to `pro` here; nothing downstream (entitlements, usage checks, the UI)
 * needs to change.
 *
 * Two sources, by design (see /admin's Plan Settings section):
 * - `starter` and `pro` are DB-backed (the `plan_configs` table, edited only
 *   through the Admin Panel) — product limits and the Pro demo price must be
 *   changeable without a deploy.
 * - `development` stays code-defined below — it's developer-controlled, not
 *   an admin-editable product limit, and keeping it in code means local
 *   development is never blocked by (or dependent on) a database row
 *   existing.
 */
export type PlanId = "development" | "starter" | "pro";

/**
 * How a plan's usage resets, if ever:
 * - `lifetime`: sums ALL usage since account creation, never resets (Starter).
 * - `monthly`: calendar-month window, floored at the account's
 *   `plan_changed_at` so a fresh Pro period never inherits usage recorded
 *   before the upgrade (see lib/entitlements/period.ts).
 * - `unlimited`: same accounting as lifetime (never resets) — Development's
 *   limits are just generous enough that resetting was never the point.
 */
export type UsagePeriodKind = "lifetime" | "monthly" | "unlimited";

export interface PlanLimits {
  displayName: string;
  /** Total Projects a user may own at once (not a periodic quota). */
  maxProjects: number;
  /** User-initiated AI operations allowed per usagePeriod — see lib/entitlements/period.ts's getEntitlementPeriod. */
  aiActionsLimit: number;
  /** Transcription allowance per usagePeriod, in minutes (tracked internally in seconds). */
  transcriptionMinutesLimit: number;
  /**
   * Hard INTERNAL safety cap on real OpenAI provider cost (see
   * lib/entitlements/cost.ts and lib/entitlements/reservation.ts) —
   * completely independent of the product-facing limits above, and never
   * shown to the user (see the Account/Usage UI, which never renders this
   * field). `null` means no application-level cost cap is enforced for this
   * plan — used for development/pro today, since abuse there is not a
   * real-world concern the way an anonymous Starter signup is.
   */
  apiCostBudgetUsd: number | null;
  usagePeriod: UsagePeriodKind;
  /** Demo commercial price only — never wired to a real payment provider. `0`/`null` for non-paid plans. */
  monthlyPricePln: number | null;
}

/**
 * Code-defined limits for `development`, plus a hardcoded Starter/Pro
 * fallback used only if the corresponding `plan_configs` DB row is ever
 * missing (defensive — should not happen once 0014_starter_pro_plans.sql has
 * run; see getPlanLimits() below). The Starter/Pro numbers here match the
 * product spec's suggested defaults, but the DB row is the live source of
 * truth once Admin edits it.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  development: {
    displayName: "Development",
    maxProjects: 50,
    aiActionsLimit: 1000,
    transcriptionMinutesLimit: 1000,
    apiCostBudgetUsd: null,
    usagePeriod: "monthly",
    monthlyPricePln: null,
  },
  starter: {
    displayName: "Starter",
    maxProjects: 3,
    aiActionsLimit: 10,
    transcriptionMinutesLimit: 20,
    apiCostBudgetUsd: 0.5,
    usagePeriod: "lifetime",
    monthlyPricePln: 0,
  },
  pro: {
    displayName: "Pro",
    maxProjects: 25,
    aiActionsLimit: 300,
    transcriptionMinutesLimit: 180,
    apiCostBudgetUsd: null,
    usagePeriod: "monthly",
    monthlyPricePln: 49,
  },
};

/** Safety-net fallback only (see lib/entitlements/profile.ts's getUserProfile doc comment) — NOT what new signups get; that's the DB trigger's job. */
export const DEFAULT_PLAN_ID: PlanId = "development";

/**
 * Resolves a plan's limits. For `starter`/`pro`, reads the live
 * `plan_configs` row (see supabase/migrations/0014_starter_pro_plans.sql)
 * via the ordinary session client — these numbers aren't sensitive (the
 * Account/Upgrade pages already show them), so no admin/service-role client
 * is needed just to read them; only the Admin Panel's write path needs
 * elevated access. Falls back to the code-defined PLAN_LIMITS (logged) if
 * that row is ever missing, so a bad migration state degrades gracefully
 * instead of breaking every request for that plan.
 */
export async function getPlanLimits(planId: PlanId): Promise<PlanLimits> {
  if (planId === "development") {
    return PLAN_LIMITS.development;
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("plan_configs")
    .select("display_name, max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, usage_period, monthly_price_pln")
    .eq("plan_id", planId)
    .maybeSingle();

  if (error) {
    console.error(`[plan-config] failed to read "${planId}" plan_configs row, using code fallback:`, error);
    return PLAN_LIMITS[planId];
  }
  if (!data) {
    console.error(`[plan-config] "${planId}" plan_configs row is missing, using code fallback`);
    return PLAN_LIMITS[planId];
  }

  return {
    displayName: data.display_name ?? PLAN_LIMITS[planId].displayName,
    maxProjects: data.max_projects,
    aiActionsLimit: data.ai_actions_limit,
    transcriptionMinutesLimit: Number(data.transcription_minutes_limit),
    apiCostBudgetUsd: data.api_cost_budget_usd === null ? null : Number(data.api_cost_budget_usd),
    usagePeriod: (data.usage_period as UsagePeriodKind) ?? PLAN_LIMITS[planId].usagePeriod,
    monthlyPricePln: data.monthly_price_pln === null ? null : Number(data.monthly_price_pln),
  };
}
