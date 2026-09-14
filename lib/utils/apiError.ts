/**
 * Turns an API error response body into a user-facing message. Every route
 * that can hit a usage limit returns the same structured shape (see
 * lib/utils/api.ts's withApiErrorHandling and lib/entitlements/errors.ts) —
 * this is the one place that shape gets turned into copy, so every form in
 * the app shows the same wording (and the same "Upgrade to Pro" nudge)
 * instead of a raw error code like "usage_limit_reached".
 */

const USAGE_LIMIT_MESSAGES: Record<string, string> = {
  projects: "You've reached your Starter project limit.",
  ai_actions: "You've used all AI Actions available on your plan.",
  transcription_minutes: "You've used all transcription minutes available on your plan.",
};

/**
 * `isProjectOwner` distinguishes the two audiences a usage-limit message can
 * reach: the account whose plan/usage was actually exhausted (Owner — can
 * act on "Upgrade to Pro"), vs. a Member spending against a shared Project
 * they don't own and can't upgrade. Defaults to true (the pre-collaboration
 * behavior) so existing call sites outside a Project context are unaffected.
 */
export function resolveApiErrorMessage(data: unknown, fallback: string, isProjectOwner = true): string {
  if (data && typeof data === "object" && "error" in data) {
    const body = data as { error?: unknown; resource?: unknown };
    if (body.error === "usage_limit_reached") {
      const resource = typeof body.resource === "string" ? body.resource : "";
      const label = USAGE_LIMIT_MESSAGES[resource] ?? "You've reached a usage limit on your plan.";
      return isProjectOwner
        ? `${label} Upgrade to Pro for higher limits.`
        : `${label} Ask the project owner to upgrade to Pro for higher limits.`;
    }
    if (body.error === "provider_budget_exhausted") {
      // Never explain WHY in provider-cost/dollar terms — see
      // lib/entitlements/reservation.ts's ProviderBudgetExhaustedError.
      return isProjectOwner
        ? "You've reached the usage limit for your plan. Upgrade to Pro for higher limits."
        : "You've reached the usage limit for this project. Ask the project owner to upgrade to Pro for higher limits.";
    }
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  }
  return fallback;
}
