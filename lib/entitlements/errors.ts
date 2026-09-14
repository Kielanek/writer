export type UsageResource = "projects" | "ai_actions" | "transcription_minutes";

/**
 * Thrown by checkAiActionLimit()/checkTranscriptionAllowance()/createProject()
 * and caught centrally by lib/utils/api.ts's withApiErrorHandling, so every
 * route returns the exact same structured 429 shape instead of each route
 * inventing its own message. The frontend maps this to a plain message plus
 * an "Upgrade to Pro" CTA — see lib/utils/apiError.ts.
 */
export class UsageLimitError extends Error {
  resource: UsageResource;
  used: number;
  limit: number;
  /** Null for "projects" (a standing cap, not a periodic quota — it doesn't reset on its own) and for a lifetime-scoped resource (Starter never resets). */
  resetsAt?: string | null;

  constructor(input: { resource: UsageResource; used: number; limit: number; resetsAt?: string | null }) {
    super(`Usage limit reached for ${input.resource}`);
    this.resource = input.resource;
    this.used = input.used;
    this.limit = input.limit;
    this.resetsAt = input.resetsAt ?? null;
  }
}
