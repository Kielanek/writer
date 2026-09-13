/**
 * The ONLY place OpenAI per-token/per-minute pricing is defined. Every cost
 * calculation (lib/entitlements/cost.ts) looks a model up here by its exact
 * ID — never hardcode a price anywhere else.
 *
 * Historical accuracy: this config is read only at the moment a NEW
 * request's cost is calculated. Already-recorded usage_events rows store
 * their own `estimatedCostUsd` permanently — changing a price here never
 * recalculates history, only affects requests from now on.
 *
 * Verified pricing as of this writing:
 * - gpt-5.6-terra (text): $2.00 / 1M uncached input, $0.20 / 1M cached
 *   input, $12.00 / 1M output tokens.
 * - gpt-transcribe (transcription): $0.0045 / minute.
 *
 * IMPORTANT — currently configured vs. currently priced models:
 * `OPENAI_TEXT_MODEL` defaults to "gpt-5.6-terra" (see lib/env.ts), which
 * matches the pricing above. `OPENAI_TRANSCRIPTION_MODEL` defaults to
 * "whisper-1" — a DIFFERENT model than "gpt-transcribe", which is the only
 * transcription model priced below. There is no verified whisper-1 price
 * in this config on purpose (never invent a number that wasn't actually
 * given). Until either (a) whisper-1 pricing is added here, or (b)
 * OPENAI_TRANSCRIPTION_MODEL is changed to "gpt-transcribe", transcription
 * cost cannot be calculated for the currently-configured model — see
 * lib/entitlements/cost.ts's UnknownModelPricingError handling for exactly
 * what happens in that case (fails closed for cost-capped plans like
 * trial; allowed-but-logged for uncapped plans like development).
 */

export type ProviderPricingEntry =
  | {
      type: "text";
      inputPerMillionUsd: number;
      cachedInputPerMillionUsd: number;
      outputPerMillionUsd: number;
    }
  | {
      type: "transcription";
      perMinuteUsd: number;
    };

export const PROVIDER_PRICING: Record<string, ProviderPricingEntry> = {
  "gpt-5.6-terra": {
    type: "text",
    inputPerMillionUsd: 2.0,
    cachedInputPerMillionUsd: 0.2,
    outputPerMillionUsd: 12.0,
  },
  "gpt-transcribe": {
    type: "transcription",
    perMinuteUsd: 0.0045,
  },
};
