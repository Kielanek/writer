/**
 * Turns an API error response body into a user-facing message. Every route
 * that can hit a usage limit returns the same structured shape (see
 * lib/utils/api.ts's withApiErrorHandling and lib/entitlements/errors.ts) —
 * this is the one place that shape gets turned into copy, so every form in
 * the app shows the same wording instead of a raw error code like
 * "usage_limit_reached".
 */

const USAGE_LIMIT_MESSAGES: Record<string, string> = {
  projects: "You've reached your project limit.",
  ai_actions: "You've reached your monthly AI limit.",
  transcription_minutes: "You've reached your transcription limit for this month.",
};

export function resolveApiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const body = data as { error?: unknown; resource?: unknown };
    if (body.error === "usage_limit_reached") {
      const resource = typeof body.resource === "string" ? body.resource : "";
      const label = USAGE_LIMIT_MESSAGES[resource] ?? "You've reached a usage limit.";
      return `${label} Plan upgrades are coming soon.`;
    }
    if (body.error === "trial_budget_exhausted") {
      // Never explain WHY in provider-cost/dollar terms — see
      // lib/entitlements/reservation.ts's TrialBudgetExhaustedError.
      return "You've reached the usage limit for your trial.";
    }
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  }
  return fallback;
}
