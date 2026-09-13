/**
 * Centralized monthly usage window: calendar month in UTC. Every usage
 * query and check must go through this rather than computing "this month"
 * ad hoc — when Stripe billing periods arrive later, this is the one place
 * that changes (e.g. to align with `current_period_start`/`_end` from the
 * subscription) instead of every call site.
 */
export interface UsagePeriod {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

export function getCurrentUsagePeriod(now: Date = new Date()): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}
