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

/**
 * Resolves the correct usage-accounting window for a given account: a
 * trial account's AI-action/transcription-minute usage belongs to its
 * whole trial (trial_started_at -> trial_ends_at), NOT the calendar month —
 * a 7-day trial spanning a month boundary must not reset just because the
 * month rolled over. Development/pro (and any future monthly-billed plan)
 * keep the calendar-month window. Centralized here so every caller
 * (checkAiActionLimit, checkTranscriptionAllowance, getUserEntitlements,
 * the Admin user list) resolves periods identically.
 */
export function getEntitlementPeriod(
  profile: { planId: string; trialStartedAt: string | null; trialEndsAt: string | null },
  now: Date = new Date()
): UsagePeriod {
  if (profile.planId === "trial" && profile.trialStartedAt && profile.trialEndsAt) {
    return { start: new Date(profile.trialStartedAt), end: new Date(profile.trialEndsAt) };
  }
  return getCurrentUsagePeriod(now);
}
