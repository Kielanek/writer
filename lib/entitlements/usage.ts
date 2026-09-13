import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { getCurrentUsagePeriod } from "@/lib/entitlements/period";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getUserPlan } from "@/lib/entitlements/profile";
import { UsageLimitError } from "@/lib/entitlements/errors";
import { getProviderCostTotal } from "@/lib/entitlements/reservation";

export type UsageEventType = "ai_action" | "transcription_seconds" | "provider_cost";

export interface ResourceUsage {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export interface UserEntitlements {
  plan: Awaited<ReturnType<typeof getUserPlan>>;
  projects: { used: number; limit: number; remaining: number };
  aiActions: ResourceUsage;
  transcriptionMinutes: ResourceUsage;
  /**
   * INTERNAL ONLY. Real OpenAI provider-cost accounting — never send this
   * to the frontend (GET /api/usage strips it before responding; see
   * lib/entitlements/plans.ts's apiCostBudgetUsd doc comment for why).
   * `null` when the current plan has no cost cap (development/pro).
   */
  providerCost: { usedUsd: number; limitUsd: number; remainingUsd: number } | null;
}

/**
 * Current-period total for one event type, scoped to the authenticated
 * caller. Goes through the get_usage_total() Postgres function (see
 * supabase/migrations/0007_usage_limits.sql) rather than a plain
 * `.select("quantity")` + JS-side sum, so the aggregation happens in the
 * database and the function's own `auth.uid()` check is the source of
 * truth for "whose usage this is" — never a value threaded through from
 * the caller.
 */
async function getUsageTotal(eventType: UsageEventType): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { start } = getCurrentUsagePeriod();

  const { data, error } = await supabase.rpc("get_usage_total", {
    p_event_type: eventType,
    p_period_start: start.toISOString(),
  });

  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Records a billable event. ALWAYS uses the admin/secret client — normal
 * users have no INSERT grant on usage_events at all (see the migration),
 * so this is the only code path that can write here. Call this only after
 * the operation it accounts for has actually succeeded; quantity must
 * always be server-computed, never a value that came from the request body.
 */
export async function recordUsageEvent(input: {
  eventType: UsageEventType;
  quantity: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { error } = await admin.from("usage_events").insert({
    user_id: user.id,
    event_type: input.eventType,
    quantity: input.quantity,
    metadata: input.metadata ?? null,
  });

  if (error) throw error;
}

/**
 * Call before every user-initiated AI operation that isn't note metadata
 * generation (see lib/ai/noteMetadata.ts's doc comment for why that one is
 * excluded from limits). Throws UsageLimitError — never returns false —
 * so callers can't accidentally ignore the result.
 *
 * Concurrency note: this reads the current total, compares to the limit,
 * and returns; it does not reserve the slot. Two nearly-simultaneous
 * requests from the same user can both pass this check before either's
 * recordUsageEvent() call lands, allowing a small overrun bounded by how
 * many requests that user has in flight at once (in practice: a handful of
 * browser tabs, not an exploitable amount). Fully closing this would need
 * a reservation/ledger system, which is out of scope for this MVP — see
 * create_project_with_limit() in the migration for the one place an
 * atomic, advisory-lock-based check was worth the complexity (creation is
 * a single fast DB statement; AI calls take seconds against an external
 * API, so "reserve before, release after" would need far more machinery).
 */
export async function checkAiActionLimit(): Promise<void> {
  const plan = await getUserPlan();
  const limit = getPlanLimits(plan).aiActionsPerMonth;
  const used = await getUsageTotal("ai_action");

  if (used >= limit) {
    throw new UsageLimitError({
      resource: "ai_actions",
      used,
      limit,
      resetsAt: getCurrentUsagePeriod().end.toISOString(),
    });
  }
}

/**
 * Call before transcribing audio. Same "already exhausted" check as
 * checkAiActionLimit() — not a pre-reservation of this specific file's
 * duration, since that duration isn't known until Whisper has already
 * transcribed it (see lib/ai/transcribeAudio.ts). A single transcription
 * can therefore push a user slightly over their limit; the NEXT one is
 * blocked. Documented rather than solved with a fragile duration estimate.
 */
export async function checkTranscriptionAllowance(): Promise<void> {
  const plan = await getUserPlan();
  const limitMinutes = getPlanLimits(plan).transcriptionMinutesPerMonth;
  const limitSeconds = limitMinutes * 60;
  const usedSeconds = await getUsageTotal("transcription_seconds");

  if (usedSeconds >= limitSeconds) {
    throw new UsageLimitError({
      resource: "transcription_minutes",
      used: Math.round((usedSeconds / 60) * 10) / 10,
      limit: limitMinutes,
      resetsAt: getCurrentUsagePeriod().end.toISOString(),
    });
  }
}

/** Full usage snapshot for the account/usage UI (GET /api/usage). */
export async function getUserEntitlements(): Promise<UserEntitlements> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();
  const plan = await getUserPlan();
  const limits = getPlanLimits(plan);
  const { end: resetsAt } = getCurrentUsagePeriod();

  const [{ count: projectCount, error: projectsError }, aiActionsUsed, transcriptionSecondsUsed, providerCostUsed] =
    await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      getUsageTotal("ai_action"),
      getUsageTotal("transcription_seconds"),
      limits.apiCostBudgetUsd !== null ? getProviderCostTotal() : Promise.resolve(null),
    ]);

  if (projectsError) throw projectsError;

  const transcriptionMinutesUsed = Math.round((transcriptionSecondsUsed / 60) * 10) / 10;

  return {
    plan,
    projects: {
      used: projectCount ?? 0,
      limit: limits.maxProjects,
      remaining: Math.max(0, limits.maxProjects - (projectCount ?? 0)),
    },
    aiActions: {
      used: aiActionsUsed,
      limit: limits.aiActionsPerMonth,
      remaining: Math.max(0, limits.aiActionsPerMonth - aiActionsUsed),
      resetsAt: resetsAt.toISOString(),
    },
    transcriptionMinutes: {
      used: transcriptionMinutesUsed,
      limit: limits.transcriptionMinutesPerMonth,
      remaining: Math.max(0, limits.transcriptionMinutesPerMonth - transcriptionMinutesUsed),
      resetsAt: resetsAt.toISOString(),
    },
    providerCost:
      limits.apiCostBudgetUsd !== null && providerCostUsed !== null
        ? {
            usedUsd: providerCostUsed,
            limitUsd: limits.apiCostBudgetUsd,
            remainingUsd: Math.max(0, limits.apiCostBudgetUsd - providerCostUsed),
          }
        : null,
  };
}
