import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TrialConfig {
  maxProjects: number;
  aiActionsLimit: number;
  transcriptionMinutesLimit: number;
  apiCostBudgetUsd: number | null;
  trialDays: number;
}

/**
 * Reads via the admin client for consistency with the rest of this module
 * (every /api/admin/* route is already admin-authorized before it gets
 * here) — though note lib/entitlements/plans.ts's getPlanLimits() reads
 * this same table via the ordinary session client for ENFORCEMENT, since
 * `authenticated` has a plain SELECT grant on plan_configs (these numbers
 * aren't sensitive; only writing them is admin-only).
 */
export async function getTrialConfig(): Promise<TrialConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plan_configs")
    .select("max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, trial_days")
    .eq("plan_id", "trial")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("plan_configs row for 'trial' is missing — re-run supabase/migrations/0010_admin_trial_config.sql");

  return {
    maxProjects: data.max_projects,
    aiActionsLimit: data.ai_actions_limit,
    transcriptionMinutesLimit: Number(data.transcription_minutes_limit),
    apiCostBudgetUsd: data.api_cost_budget_usd === null ? null : Number(data.api_cost_budget_usd),
    trialDays: data.trial_days,
  };
}

/**
 * The ONLY code path that may write plan_configs — `authenticated` has
 * zero write grant on this table at all (see the migration), so a normal
 * user calling this from a client-side Supabase query would fail
 * regardless; this exists so the already-admin-authorized route handler
 * has a typed, single place to call rather than inlining the admin-client
 * update. Caller is responsible for requireAdmin() and the audit log entry
 * (see app/api/admin/trial-config/route.ts).
 */
export async function updateTrialConfig(config: TrialConfig): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("plan_configs")
    .update({
      max_projects: config.maxProjects,
      ai_actions_limit: config.aiActionsLimit,
      transcription_minutes_limit: config.transcriptionMinutesLimit,
      api_cost_budget_usd: config.apiCostBudgetUsd,
      trial_days: config.trialDays,
    })
    .eq("plan_id", "trial");

  if (error) throw error;
}
