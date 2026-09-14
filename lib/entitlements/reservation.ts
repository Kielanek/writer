import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { getEntitlementPeriod } from "@/lib/entitlements/period";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getUserProfile } from "@/lib/entitlements/profile";
import { UnknownModelPricingError } from "@/lib/entitlements/cost";

/**
 * Distinct from UsageLimitError on purpose (see lib/entitlements/errors.ts)
 * — this must NEVER carry a `used`/`limit` in USD, because the entire point
 * is that real provider economics never reach the client. Maps to exactly
 * the flat shape the product spec calls for: `{"error": "provider_budget_exhausted"}`.
 */
export class ProviderBudgetExhaustedError extends Error {
  constructor() {
    super("Provider-cost budget exhausted");
  }
}

export interface ProviderReservation {
  id: string;
  reservedCostUsd: number;
}

/**
 * Real provider cost, in USD, for the caller's current entitlement period —
 * the epoch (i.e. all-time) for Starter's lifetime cap, or the current Pro
 * period for a Pro account with a cap (see
 * lib/entitlements/period.ts's getEntitlementPeriod()). Internal only —
 * never wired into a route response; see getUserEntitlements()'s
 * `providerCost` field, which is deliberately stripped before GET /api/usage
 * returns it (the Admin Panel is the one place it IS exposed, to an
 * already-verified admin only).
 */
export async function getProviderCostTotal(): Promise<number> {
  const profile = await getUserProfile();
  const period = getEntitlementPeriod(profile);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_provider_cost_total", {
    p_period_start: period.start.toISOString(),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Atomically reserves `estimatedCostUsd` against the current plan's
 * apiCostBudgetUsd, BEFORE the caller makes the actual OpenAI request.
 * Returns null when the plan has no cost cap (development/pro today) —
 * there's nothing to reserve against, so this is a deliberate no-op rather
 * than reserving an amount no one will ever check.
 *
 * Throws ProviderBudgetExhaustedError if the reservation would exceed
 * budget. See supabase/migrations/0014_starter_pro_plans.sql's
 * reserve_provider_budget() for the atomic (advisory-lock-serialized)
 * database side of this check — the real security boundary; this function
 * is just its thin, typed wrapper.
 */
export async function checkAndReserveProviderBudget(input: {
  feature: string;
  estimatedCostUsd: number;
}): Promise<ProviderReservation | null> {
  const profile = await getUserProfile();
  const budget = (await getPlanLimits(profile.planId)).apiCostBudgetUsd;
  if (budget === null) return null;

  const period = getEntitlementPeriod(profile);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("reserve_provider_budget", {
      p_feature: input.feature,
      p_reserved_cost_usd: input.estimatedCostUsd,
      p_budget_limit_usd: budget,
      p_period_start: period.start.toISOString(),
    })
    .single();

  if (error) {
    if (error.message?.includes("provider_budget_exhausted")) {
      console.warn(`[provider-cost] budget exhausted for feature "${input.feature}"`);
      throw new ProviderBudgetExhaustedError();
    }
    throw error;
  }

  return { id: (data as { id: string }).id, reservedCostUsd: Number((data as { reserved_cost_usd: unknown }).reserved_cost_usd) };
}

/** Call after a successful OpenAI request with its real provider-reported cost. */
export async function reconcileProviderReservation(
  reservationId: string,
  actualCostUsd: number,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("reconcile_provider_reservation", {
    p_reservation_id: reservationId,
    p_actual_cost_usd: actualCostUsd,
    p_metadata: metadata,
  });
  if (error) throw error;
}

/**
 * Call when the guarded operation failed before/without incurring real
 * provider cost. Best-effort: logs rather than throws, so a release failure
 * never masks the original error that triggered the release.
 */
export async function releaseProviderReservation(reservationId: string): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.rpc("release_provider_reservation", {
      p_reservation_id: reservationId,
    });
    if (error) throw error;
  } catch (err) {
    console.error(`[provider-cost] failed to release reservation ${reservationId}:`, err);
  }
}

/**
 * Resolves a cost estimate for a plan, handling an unpriced model per the
 * product spec: fails closed (throws) when the plan has a real budget to
 * protect, allows-but-logs when it doesn't (nothing to protect there, but
 * still worth alerting a developer that pricing config is incomplete).
 */
export function resolveEstimateOrFailClosed(compute: () => number, hasBudgetCap: boolean): number {
  try {
    return compute();
  } catch (err) {
    if (err instanceof UnknownModelPricingError) {
      console.error(`[provider-pricing] ${err.message}`);
      if (hasBudgetCap) throw err;
      return 0;
    }
    throw err;
  }
}

/**
 * The single place that wraps "reserve worst-case cost -> do the expensive
 * thing -> reconcile to actual cost, or release on failure" — every OpenAI
 * call site should go through this (via lib/ai/guarded.ts) rather than
 * reimplementing the reserve/reconcile/release dance itself.
 */
export async function withProviderCostGuard<T>(params: {
  feature: string;
  estimatedCostUsd: number;
  run: () => Promise<{ result: T; actualCostUsd: number; metadata?: Record<string, unknown> }>;
  /** Fallback recorder used when the plan has no cost cap (so no reservation exists to reconcile) — see lib/entitlements/usage.ts's recordUsageEvent. */
  recordUncapped: (actualCostUsd: number, metadata: Record<string, unknown>) => Promise<void>;
}): Promise<T> {
  const reservation = await checkAndReserveProviderBudget({
    feature: params.feature,
    estimatedCostUsd: params.estimatedCostUsd,
  });

  try {
    const { result, actualCostUsd, metadata } = await params.run();

    if (reservation) {
      await reconcileProviderReservation(reservation.id, actualCostUsd, metadata ?? {});
    } else {
      await params.recordUncapped(actualCostUsd, { feature: params.feature, ...metadata });
    }

    return result;
  } catch (err) {
    if (reservation) await releaseProviderReservation(reservation.id);
    throw err;
  }
}
