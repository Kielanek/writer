import "server-only";
import { PROVIDER_PRICING } from "@/lib/entitlements/provider-pricing";

/**
 * Thrown whenever a cost calculation is asked about a model with no entry
 * in PROVIDER_PRICING. Callers MUST NOT catch this and silently treat it as
 * zero cost — that would defeat the provider-cost budget entirely. See
 * lib/entitlements/reservation.ts's handling: fails closed (blocks the
 * action) for any plan with a real apiCostBudgetUsd, allowed-but-logged for
 * plans with no cap.
 */
export class UnknownModelPricingError extends Error {
  constructor(public readonly model: string) {
    super(
      `No pricing configured for model "${model}" in lib/entitlements/provider-pricing.ts. ` +
        `Add it there before this model can be used by a cost-capped plan.`
    );
  }
}

/**
 * A rough, deliberately conservative token-count approximation (~4 chars/
 * token for English text) — the same convention already used by
 * lib/context/buildProjectContext.ts's note-budget check. Only used for the
 * PRE-CALL worst-case reservation estimate; the actual recorded cost always
 * uses the provider's own reported token counts (see
 * lib/ai/generateText.ts's TextGenerationUsage), never this estimate.
 */
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Terra's cost formula (see PROVIDER_PRICING's doc comment for the
 * verified per-token rates):
 *
 *   nonCachedInputTokens = inputTokens - cachedInputTokens
 *   cost = nonCachedInputTokens/1e6 * inputRate
 *        + cachedInputTokens/1e6 * cachedInputRate
 *        + outputTokens/1e6 * outputRate
 *
 * Generalized here to any model tagged `type: "text"` in PROVIDER_PRICING,
 * so switching models later means updating that config, not this formula.
 *
 * Plain JS floating point is precise enough here (IEEE-754 doubles carry
 * ~15-17 significant decimal digits; these costs sit well under $1 with at
 * most 8 decimal places of meaningful precision) — a big-decimal library
 * would be unjustified complexity at this scale. The DB column that stores
 * this value is `numeric(12,8)` (exact, not float) precisely so repeated
 * storage/retrieval never accumulates rounding error even though the JS
 * arithmetic producing the number is plain floats.
 */
export function calculateTextCostUsd(input: {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}): number {
  const pricing = PROVIDER_PRICING[input.model];
  if (!pricing || pricing.type !== "text") {
    throw new UnknownModelPricingError(input.model);
  }

  const nonCachedInputTokens = Math.max(0, input.inputTokens - input.cachedInputTokens);

  return (
    (nonCachedInputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (input.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillionUsd +
    (input.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
}

export function calculateTranscriptionCostUsd(input: { model: string; durationSeconds: number }): number {
  const pricing = PROVIDER_PRICING[input.model];
  if (!pricing || pricing.type !== "transcription") {
    throw new UnknownModelPricingError(input.model);
  }

  return (input.durationSeconds / 60) * pricing.perMinuteUsd;
}

/**
 * Conservative bitrate floor used ONLY to turn an audio file's byte size
 * into a worst-case duration estimate BEFORE transcription — true duration
 * isn't known until Whisper has already processed the file (see
 * lib/ai/transcribeAudio.ts), so there is no exact pre-call measurement to
 * reuse (the transcription-minutes limit has the same constraint — see
 * lib/entitlements/usage.ts's checkTranscriptionAllowance doc comment).
 *
 * 32 kbps is below virtually every real compressed voice-note codec/format
 * this app accepts (mp3/m4a/webm/ogg voice recordings are typically
 * 32-128kbps; even low-quality ones rarely go lower) — dividing by a rate
 * this low always yields a duration estimate >= the true duration for any
 * real file, which is exactly the safety property a pre-call reservation
 * needs. It deliberately does NOT try to parse the file's actual header/
 * codec — that would be exactly the "fragile implementation solely for
 * accounting" the product spec warns against.
 */
const CONSERVATIVE_MIN_BITRATE_BPS = 32_000;

export function estimateTranscriptionDurationSecondsFromFileSize(fileSizeBytes: number): number {
  return (fileSizeBytes * 8) / CONSERVATIVE_MIN_BITRATE_BPS;
}

/**
 * Per-feature worst-case OUTPUT token ceiling used for the pre-call cost
 * reservation — and also passed as the real `max_completion_tokens` on the
 * actual OpenAI request (see lib/ai/guarded.ts), so the reservation is a
 * true upper bound rather than a guess that the live request could exceed.
 * Chosen generously enough not to truncate any realistic Document/Note/
 * chat answer in this product; tune freely if a feature starts hitting it.
 */
export const FEATURE_COST_GUARDS = {
  document_generation: { maxOutputTokens: 4000 },
  document_generation_repair: { maxOutputTokens: 1500 },
  document_edit: { maxOutputTokens: 4000 },
  document_edit_repair: { maxOutputTokens: 1500 },
  ask_project: { maxOutputTokens: 1500 },
  analyze_examples: { maxOutputTokens: 800 },
  note_metadata: { maxOutputTokens: 200 },
  document_meta: { maxOutputTokens: 300 },
} as const;

export type CostGuardedFeature = keyof typeof FEATURE_COST_GUARDS;
