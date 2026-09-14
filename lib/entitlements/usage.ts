import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { getEntitlementPeriod } from "@/lib/entitlements/period";
import { getPlanLimits, type PlanId, type PlanLimits, type UsagePeriodKind } from "@/lib/entitlements/plans";
import { getUserProfile, getProfileForUser } from "@/lib/entitlements/profile";
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
 * CALLER themselves. Goes through the get_usage_total() Postgres function
 * (session-scoped, `auth.uid()`-derived) — used only by the self-service
 * Account page (getUserEntitlements, below). Project-scoped billing-owner
 * totals (which may belong to a DIFFERENT user than the caller) use
 * getUsageTotalForUser() instead — see that function's doc comment.
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
 * Current-period total for one event type, for an ARBITRARY user id — via
 * the admin/secret client, bypassing `usage_events_select_own` RLS (which
 * only ever allows `user_id = auth.uid()`). This is what makes billing an
 * action to a Project OWNER work when the ACTOR is a Member: the route
 * resolves `billingUserId` from a trusted source (Project.owner_id, via
 * getProject() — itself RLS-gated to the actor's own accessible Projects)
 * and sums THAT user's usage directly, the same technique the Admin Panel's
 * per-user view (lib/admin/entitlements.ts) already used before
 * collaboration existed.
 */
export async function getUsageTotalForUser(
  userId: string,
  eventType: UsageEventType,
  periodStart: Date
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usage_events")
    .select("quantity")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .gte("created_at", periodStart.toISOString());

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
}

/**
 * Records a billable event. ALWAYS uses the admin/secret client — normal
 * users have no INSERT grant on usage_events at all (see the migration), so
 * this is the only code path that can write here. Call this only after the
 * operation it accounts for has actually succeeded; quantity must always be
 * server-computed, never a value that came from the request body.
 *
 * `billingUserId` is whose plan/allowance this counts against (a Project
 * Owner, or the caller themselves for non-project actions like Analyze
 * Examples) — REQUIRED, never defaulted, so every call site makes an
 * explicit, reviewable choice about who's being billed. `actorUserId`
 * defaults to `billingUserId` (the pre-collaboration behavior: you always
 * billed yourself) — pass it explicitly whenever the real actor might
 * differ (a Member working in someone else's Project).
 */
export async function recordUsageEvent(input: {
  eventType: UsageEventType;
  quantity: number;
  metadata?: Record<string, unknown>;
  billingUserId: string;
  actorUserId?: string;
  projectId?: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("usage_events").insert({
    user_id: input.billingUserId,
    actor_user_id: input.actorUserId ?? input.billingUserId,
    project_id: input.projectId ?? null,
    event_type: input.eventType,
    quantity: input.quantity,
    metadata: input.metadata ?? null,
  });

  if (error) throw error;
}

/**
 * Call before every user-initiated AI operation that isn't note metadata
 * generation (see lib/ai/noteMetadata.ts's doc comment for why that one is
 * excluded from limits). Throws UsageLimitError once the BILLING user's
 * plan limit is reached — never returns false — so callers can't
 * accidentally ignore the result. There is no time-based expiration to
 * check first: Starter has no end date, only a lifetime usage ceiling.
 *
 * `billingUserId` is REQUIRED and is always whoever's allowance this
 * action draws from — the Project Owner for a project-scoped action
 * (regardless of whether the actor is the Owner or a Member), or the
 * caller's own id for a non-project action. Never the session's own id by
 * default — see the collaboration model's "usage is charged to the Owner"
 * rule.
 *
 * Concurrency note: this reads the current total, compares to the limit, and
 * returns; it does not reserve the slot. Two nearly-simultaneous requests
 * from the same billing user (e.g. two Members acting in the same Owner's
 * Projects at once) can both pass this check before either's
 * recordUsageEvent() call lands, allowing a small overrun bounded by how
 * many requests are in flight at once. Fully closing this would need a
 * reservation/ledger system, which is out of scope for this MVP — see
 * create_project_with_limit()/reserve_provider_budget() in the migrations
 * for the places an atomic, advisory-lock-based check was worth the
 * complexity.
 */
export async function checkAiActionLimit(billingUserId: string): Promise<void> {
  const profile = await getProfileForUser(billingUserId);
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);
  const used = await getUsageTotalForUser(billingUserId, "ai_action", period.start);

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
 * therefore push the billing user slightly over their limit; the NEXT one
 * is blocked. Documented rather than solved with a fragile duration
 * estimate. See checkAiActionLimit()'s doc comment for what `billingUserId`
 * means.
 */
export async function checkTranscriptionAllowance(billingUserId: string): Promise<void> {
  const profile = await getProfileForUser(billingUserId);
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);
  const limitSeconds = limits.transcriptionMinutesLimit * 60;
  const usedSeconds = await getUsageTotalForUser(billingUserId, "transcription_seconds", period.start);

  if (usedSeconds >= limitSeconds) {
    throw new UsageLimitError({
      resource: "transcription_minutes",
      used: Math.round((usedSeconds / 60) * 10) / 10,
      limit: limits.transcriptionMinutesLimit,
      resetsAt: period.end?.toISOString() ?? null,
    });
  }
}

/**
 * Full usage snapshot for the account/usage UI (GET /api/usage) — ALWAYS
 * the authenticated caller's own entitlements (their personal plan), never
 * a Project they're merely a Member of. `projects.used` counts only
 * Projects this account OWNS (owner_id), matching "shared-with-me Projects
 * don't count against my limit."
 */
export async function getUserEntitlements(): Promise<UserEntitlements> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();
  const profile = await getUserProfile();
  const limits = await getPlanLimits(profile.planId);
  const period = getEntitlementPeriod(profile);

  const [{ count: projectCount, error: projectsError }, aiActionsUsed, transcriptionSecondsUsed, providerCostUsed] =
    await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      getUsageTotal("ai_action", period.start),
      getUsageTotal("transcription_seconds", period.start),
      limits.apiCostBudgetUsd !== null ? getProviderCostTotal(profile.id) : Promise.resolve(null),
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
