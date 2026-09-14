import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PlanConfig {
  planId: "starter" | "pro";
  displayName: string;
  maxProjects: number;
  aiActionsLimit: number;
  transcriptionMinutesLimit: number;
  apiCostBudgetUsd: number | null;
  monthlyPricePln: number;
}

function toPlanConfig(row: {
  plan_id: string;
  display_name: string | null;
  max_projects: number;
  ai_actions_limit: number;
  transcription_minutes_limit: number;
  api_cost_budget_usd: number | null;
  monthly_price_pln: number | null;
}): PlanConfig {
  return {
    planId: row.plan_id as "starter" | "pro",
    displayName: row.display_name ?? row.plan_id,
    maxProjects: row.max_projects,
    aiActionsLimit: row.ai_actions_limit,
    transcriptionMinutesLimit: Number(row.transcription_minutes_limit),
    apiCostBudgetUsd: row.api_cost_budget_usd === null ? null : Number(row.api_cost_budget_usd),
    monthlyPricePln: Number(row.monthly_price_pln ?? 0),
  };
}

/**
 * Reads via the admin client for consistency with the rest of this module
 * (every /api/admin/* route is already admin-authorized before it gets
 * here) — though note lib/entitlements/plans.ts's getPlanLimits() reads this
 * same table via the ordinary session client for ENFORCEMENT, since
 * `authenticated` has a plain SELECT grant on plan_configs (these numbers
 * aren't sensitive; only writing them is admin-only).
 */
export async function getAllPlanConfigs(): Promise<{ starter: PlanConfig; pro: PlanConfig }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plan_configs")
    .select("plan_id, display_name, max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, monthly_price_pln")
    .in("plan_id", ["starter", "pro"]);

  if (error) throw error;

  const starter = data?.find((r) => r.plan_id === "starter");
  const pro = data?.find((r) => r.plan_id === "pro");
  if (!starter || !pro) {
    throw new Error(
      "plan_configs is missing a 'starter' or 'pro' row — re-run supabase/migrations/0014_starter_pro_plans.sql"
    );
  }

  return { starter: toPlanConfig(starter), pro: toPlanConfig(pro) };
}

/**
 * The ONLY code path that may write plan_configs — `authenticated` has zero
 * write grant on this table at all (see the migration), so a normal user
 * calling this from a client-side Supabase query would fail regardless;
 * this exists so the already-admin-authorized route handler has a typed,
 * single place to call rather than inlining the admin-client update. Caller
 * is responsible for requireAdmin() and the audit log entry (see
 * app/api/admin/plan-config/route.ts). `usagePeriod` is intentionally not
 * editable here — Starter is always lifetime-scoped and Pro always
 * calendar-month (see lib/entitlements/period.ts); making that admin-
 * editable would break the entitlement engine's assumptions for no real
 * product benefit.
 */
export async function updatePlanConfig(config: PlanConfig): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("plan_configs")
    .update({
      display_name: config.displayName,
      max_projects: config.maxProjects,
      ai_actions_limit: config.aiActionsLimit,
      transcription_minutes_limit: config.transcriptionMinutesLimit,
      api_cost_budget_usd: config.apiCostBudgetUsd,
      monthly_price_pln: config.monthlyPricePln,
    })
    .eq("plan_id", config.planId);

  if (error) throw error;
}
