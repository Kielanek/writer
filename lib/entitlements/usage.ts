import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { getEntitlementPeriod } from "@/lib/entitlements/period";
import { getPlanLimits, type PlanId, type PlanLimits, type UsagePeriodKind } from "@/lib/entitlements/plans";
import { getUserProfile } from "@/lib/entitlements/profile";
import { UsageLimitError } from "@/lib/entitlements/errors";
import { getProviderCostTotal } from "@/lib/entitlements/reservation";

export type UsageEventType = "ai_action" | "transcription_seconds" | "provider_cost";

export interface ResourceUsage {
  used: number;
  limit: number;
  remaining: number;
  /** Null when this resource never resets (Starter's lifetime allowance, Development). */
  resetsAt: string | null;
}

export interface UserEntitlements {
  plan: PlanId;
  planDisplayName: string;
  usagePeriod: UsagePeriodKind;
  projects: { used: number; limit: number; remaining: number };
  aiActions: ResourceUsage;
  transcriptionMinutes: ResourceUsage;
  /**
   * INTERNAL ONLY. Real OpenAI provider-cost accounting — never send this to
   * the frontend (GET /api/usage strips it before responding; see
   * lib/entitlements/plans.ts's apiCostBudgetUsd doc comment for why). `null`
   * when the current plan has no cost cap (development/pro today). The
   * Admin Panel is the one place this DOES get exposed (by API design, to an
   * already-verified admin only) — see app/api/admin/users routes.
   */
  providerCost: { usedUsd: number; limitUsd: number; remainingUsd: number } | null;
}

/**
 * The pure arithmetic behind every entitlement snapshot — used by BOTH the
 * self-service path (getUserEntitlements, below) and the Admin Panel's
 * per-user view (lib/admin/entitlements.ts), so "7 / 10" means the exact
 * same thing wherever it's computed from. Only the raw inputs differ between
 * those two callers (session-scoped RPC totals vs. admin-client totals for
 * an arbitrary user) — never the math.
 */
export function buildEntitlementsSnapshot(input: {
  plan: PlanId;
  limits: PlanLimits;
  periodEnd: Date | null;
  projectCount: number;
  aiActionsUsed: number;
  transcriptionSecondsUsed: number;
  providerCostUsed: number | null;
}): UserEntitlements {
  const transcriptionMinutesUsed = Math.round((input.transcriptionSecondsUsed / 60) * 10) / 10;
  const resetsAt = input.periodEnd ? input.periodEnd.toISOString() : null;

  return {
    plan: input.plan,
    planDisplayName: input.limits.displayName,
    usagePeriod: input.limits.usagePeriod,
    projects: {
      used: input.projectCount,
      limit: input.limits.maxProjects,
      remaining: Math.max(0, input.limits.maxProjects - input.projectCount),
    },
    aiActions: {
      used: input.aiActionsUsed,
      limit: input.limits.aiActionsLimit,
      remaining: Math.max(0, input.limits.aiActionsLimit - input.aiActionsUsed),
      resetsAt,
    },
    transcriptionMinutes: {
      used: transcriptionMinutesUsed,
      limit: input.limits.transcriptionMinutesLimit,
      remaining: Math.max(0, input.limits.transcriptionMinutesLimit - transcriptionMinutesUsed),
      resetsAt,
    },
    providerCost:
      input.limits.apiCostBudgetUsd !== null && input.providerCostUsed !== null
        ? {
            usedUsd: input.providerCostUsed,
            limitUsd: input.limits.apiCostBudgetUsd,
            remainingUsd: Math.max(0, input.limits.apiCostBudgetUsd - input.providerCostUsed),
          }
        : null,
  };
}

/**
 * Current-period total for one event type, scoped to the authenticated
 * caller. Goes through the get_usage_total() Postgres function (see
 * supabase/migrations/0007_usage_limits.sql) rather than a plain
 * `.select("quantity")` + JS-side sum, so the aggregation happens in the
 * database and the function's own `auth.uid()` check is the source of truth
 * for "whose usage this is" — never a value threaded through from the
 * caller. `periodStart` comes from getEntitlementPeriod() — the epoch for a
 * lifetime-scoped plan (Starter/Development), or the current Pro period's
 * start (see that function's doc comment).
 */
async function getUsageTotal(eventType: UsageEventType, periodStart: Date): Promise<number> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_usage_total", {
    p_event_type: eventType,
    p_period_start: periodStart.toISOString(),
  });

  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Records a billable event. ALWAYS uses the admin/secret client — normal
 * users have no INSERT grant on usage_events at all (see the migration), so
 * this is the only code path that can write here. Call this only after the
 * operation it accounts for has actually succeeded; quantity must always be
 * server-computed, never a value that came from the request body.
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
 * excluded from limits). Throws UsageLimitError once the plan's limit is
 * reached — never returns false — so callers can't accidentally ignore the
 * result. There is no time-based expiration to check first: Starter has no
 * end date, only a lifetime usage ceiling.
 *
 * Concurrency note: this reads the current total, compares to the limit, and
 * returns; it does not reserve the slot. Two nearly-simultaneous requests
 * from the same user can both pass this check before either's
 * recordUsageEvent() call lands, allowing a small overrun bounded by how
 * many requests that user has in flight at once (in practice: a handful of
 * browser tabs, not an exploitable amount). Fully closing this would need a
 * reservation/ledger system, which is out of scope for this MVP — see
 * create_project_with_limit() in the migration for the one place an atomic,
 * advisory-lock-based check was worth the complexity (creation is a single
 * fast DB statement; AI calls take seconds against an external API, so
 * "reserve before, release after" would need far more machinery).
 */
export async function checkAiActionLimit(): Promise<void> {
  const profile = await getUserProfile();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);
  const used = await getUsageTotal("ai_action", period.start);

  if (used >= limits.aiActionsLimit) {
    throw new UsageLimitError({
      resource: "ai_actions",
      used,
      limit: limits.aiActionsLimit,
      resetsAt: period.end?.toISOString() ?? null,
    });
  }
}

/**
 * Call before transcribing audio. Same "already exhausted" check as
 * checkAiActionLimit() — not a pre-reservation of this specific file's
 * duration, since that duration isn't known until Whisper has already
 * transcribed it (see lib/ai/transcribeAudio.ts). A single transcription can
 * therefore push a user slightly over their limit; the NEXT one is blocked.
 * Documented rather than solved with a fragile duration estimate.
 */
export async function checkTranscriptionAllowance(): Promise<void> {
  const profile = await getUserProfile();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);
  const limitSeconds = limits.transcriptionMinutesLimit * 60;
  const usedSeconds = await getUsageTotal("transcription_seconds", period.start);

  if (usedSeconds >= limitSeconds) {
    throw new UsageLimitError({
      resource: "transcription_minutes",
      used: Math.round((usedSeconds / 60) * 10) / 10,
      limit: limits.transcriptionMinutesLimit,
      resetsAt: period.end?.toISOString() ?? null,
    });
  }
}

/** Full usage snapshot for the account/usage UI (GET /api/usage) — the authenticated caller's own entitlements. */
export async function getUserEntitlements(): Promise<UserEntitlements> {
  const supabase = await getSupabaseServerClient();
  const profile = await getUserProfile();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);

  const [{ count: projectCount, error: projectsError }, aiActionsUsed, transcriptionSecondsUsed, providerCostUsed] =
    await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
      getUsageTotal("ai_action", period.start),
      getUsageTotal("transcription_seconds", period.start),
      limits.apiCostBudgetUsd !== null ? getProviderCostTotal() : Promise.resolve(null),
    ]);

  if (projectsError) throw projectsError;

  return buildEntitlementsSnapshot({
    plan: profile.planId,
    limits,
    periodEnd: period.end,
    projectCount: projectCount ?? 0,
    aiActionsUsed,
    transcriptionSecondsUsed,
    providerCostUsed,
  });
}
