export type UsageResource = "projects" | "ai_actions" | "transcription_minutes";

/**
 * Thrown by checkAiActionLimit()/checkTranscriptionAllowance() and caught
 * centrally by lib/utils/api.ts's withApiErrorHandling, so every route
 * returns the exact same structured 429 shape (see section 17 of the spec)
 * instead of each route inventing its own message.
 */
export class UsageLimitError extends Error {
  resource: UsageResource;
  used: number;
  limit: number;
  /** Omitted for "projects" — a standing cap, not a monthly quota; it doesn't reset on its own. */
  resetsAt?: string;

  constructor(input: { resource: UsageResource; used: number; limit: number; resetsAt?: string }) {
    super(`Usage limit reached for ${input.resource}`);
    this.resource = input.resource;
    this.used = input.used;
    this.limit = input.limit;
    this.resetsAt = input.resetsAt;
  }
}

/**
 * Thrown for any entitlement-gated action (AI operations, project creation)
 * once a trial has expired. Existing content stays fully readable — this
 * only blocks NEW actions that would need an active entitlement. Mapped
 * centrally (lib/utils/api.ts) to `{"error": "trial_expired"}` with 403 —
 * distinct from UsageLimitError's 429, since this isn't "used too much,"
 * it's "your window closed."
 */
export class TrialExpiredError extends Error {
  constructor() {
    super("Trial has expired");
  }
}
