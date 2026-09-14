import type { PlanId } from "@/lib/entitlements/plans";

/**
 * Centralized usage-accounting window. Every usage query and cost check must
 * go through getEntitlementPeriod() rather than computing "the current
 * period" ad hoc — when Stripe billing periods arrive later, this is the one
 * place that changes (e.g. to align `end` with a subscription's
 * `current_period_end`) instead of every call site.
 *
 * `end: null` means the period never resets (Starter's lifetime allowance) —
 * UI code must treat a null `resetsAt` as "no countdown", not format it as a
 * date.
 */
export interface UsagePeriod {
  /** Inclusive. */
  start: Date;
  /** Exclusive. `null` if this period never ends (a lifetime-scoped plan). */
  end: Date | null;
}

export function getCurrentUsagePeriod(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/** The beginning of time, for a lifetime-scoped sum — equivalent to "no filter" against created_at/created_at-derived columns. */
const EPOCH = new Date(0);

/**
 * Resolves the correct usage-accounting window for a given account:
 *
 * - `starter`: lifetime — sums ALL usage since account creation, full stop.
 *   Never resets on a calendar boundary.
 * - `pro`: calendar month, floored at `plan_changed_at` — this is what makes
 *   "Starter historical usage does not consume the new Pro monthly
 *   allowance" true: a user who upgrades mid-month gets a period that starts
 *   at the upgrade moment, not the 1st, so nothing recorded before the
 *   upgrade is summed into the new Pro period. Once a full calendar month
 *   has passed since the upgrade, this naturally degrades to the plain
 *   calendar-month window (plan_changed_at falls before that month's start).
 *   An account with no `plan_changed_at` at all (e.g. manually set to `pro`
 *   by Admin, or a pre-existing pro account) just gets the plain calendar
 *   month.
 * - `development`: plain calendar month, same as `pro` without the
 *   plan-changed floor — unchanged from this codebase's original behavior;
 *   its limits are generous enough that resetting was never the concern.
 *
 * Centralized here so every caller (checkAiActionLimit,
 * checkTranscriptionAllowance, getUserEntitlements, getProviderCostTotal,
 * the Admin per-user view) resolves periods identically — the one place a
 * future Stripe billing-period column would replace `plan_changed_at`.
 */
export function getEntitlementPeriod(
  profile: { planId: PlanId; planChangedAt: string | null },
  now: Date = new Date()
): UsagePeriod {
  if (profile.planId === "starter") {
    return { start: EPOCH, end: null };
  }

  const calendarMonth = getCurrentUsagePeriod(now);
  if (profile.planId !== "pro") {
    return calendarMonth;
  }

  const changedAt = profile.planChangedAt ? new Date(profile.planChangedAt) : null;
  const start = changedAt && changedAt.getTime() > calendarMonth.start.getTime() ? changedAt : calendarMonth.start;
  return { start, end: calendarMonth.end };
}
