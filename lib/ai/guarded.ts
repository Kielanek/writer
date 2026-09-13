import "server-only";
import { generateText, type TextGenerationResult } from "@/lib/ai/generateText";
import { transcribeAudio, type TranscriptionResult } from "@/lib/ai/transcribeAudio";
import { env } from "@/lib/env";
import {
  calculateTextCostUsd,
  calculateTranscriptionCostUsd,
  estimateTokensFromText,
  estimateTranscriptionDurationSecondsFromFileSize,
  FEATURE_COST_GUARDS,
  type CostGuardedFeature,
} from "@/lib/entitlements/cost";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getUserPlan } from "@/lib/entitlements/profile";
import { recordUsageEvent } from "@/lib/entitlements/usage";
import { resolveEstimateOrFailClosed, withProviderCostGuard } from "@/lib/entitlements/reservation";

/**
 * The ONLY way any product feature should call generateText() or
 * transcribeAudio() — see the module doc below for why. Both wrappers
 * return exactly the same shape as the underlying lib/ai/*.ts function
 * they wrap, so call sites barely change: swap the import, add a `feature`
 * argument.
 *
 * What this buys you, centrally, for every call site:
 * 1. A conservative worst-case cost estimate BEFORE the OpenAI request.
 * 2. An atomic budget reservation for cost-capped plans (trial) — see
 *    lib/entitlements/reservation.ts — so simultaneous requests can't
 *    together overspend a shared remaining budget.
 * 3. A real `max_completion_tokens` cap on the live request matching that
 *    same estimate, so the reservation is a true upper bound, not a hope.
 * 4. Reconciliation to the provider's ACTUAL reported cost after success,
 *    or release of the reservation on failure — never both, never neither.
 * 5. A provider_cost usage_event recorded for EVERY actual OpenAI request,
 *    independent of whether that request also counts as a user-facing
 *    "AI Action" (see lib/entitlements/usage.ts's checkAiActionLimit,
 *    which callers still call separately, once per user-facing action —
 *    a repair pass or note-metadata call goes through here but never
 *    through checkAiActionLimit, exactly matching the product's
 *    "PRODUCT USAGE (AI Actions) vs. PROVIDER USAGE (cost)" split).
 */

async function planHasCostCap(): Promise<boolean> {
  const plan = await getUserPlan();
  return getPlanLimits(plan).apiCostBudgetUsd !== null;
}

export async function guardedGenerateText(
  feature: CostGuardedFeature,
  input: { system: string; prompt: string; temperature?: number }
): Promise<TextGenerationResult> {
  const hasCap = await planHasCostCap();
  const maxOutputTokens = FEATURE_COST_GUARDS[feature].maxOutputTokens;
  const model = env.openaiTextModel();

  const estimatedInputTokens = estimateTokensFromText(input.system) + estimateTokensFromText(input.prompt);
  const estimatedCostUsd = resolveEstimateOrFailClosed(
    () =>
      calculateTextCostUsd({
        model,
        inputTokens: estimatedInputTokens,
        cachedInputTokens: 0, // worst case: assume no cache hit
        outputTokens: maxOutputTokens,
      }),
    hasCap
  );

  return withProviderCostGuard({
    feature,
    estimatedCostUsd,
    run: async () => {
      const result = await generateText({ ...input, maxOutputTokens });
      const actualCostUsd = result.usage
        ? resolveEstimateOrFailClosed(
            () =>
              calculateTextCostUsd({
                model: result.usage!.model,
                inputTokens: result.usage!.inputTokens,
                cachedInputTokens: result.usage!.cachedInputTokens,
                outputTokens: result.usage!.outputTokens,
              }),
            hasCap
          )
        : 0;

      return {
        result,
        actualCostUsd,
        metadata: {
          model: result.usage?.model ?? model,
          inputTokens: result.usage?.inputTokens,
          cachedInputTokens: result.usage?.cachedInputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          reasoningTokens: result.usage?.reasoningTokens,
          estimatedCostUsd: actualCostUsd,
        },
      };
    },
    recordUncapped: (actualCostUsd, metadata) =>
      recordUsageEvent({ eventType: "provider_cost", quantity: actualCostUsd, metadata }),
  });
}

export async function guardedTranscribeAudio(file: File): Promise<TranscriptionResult> {
  const feature = "transcription";
  const hasCap = await planHasCostCap();
  const model = env.openaiTranscriptionModel();

  const estimatedDurationSeconds = estimateTranscriptionDurationSecondsFromFileSize(file.size);
  const estimatedCostUsd = resolveEstimateOrFailClosed(
    () => calculateTranscriptionCostUsd({ model, durationSeconds: estimatedDurationSeconds }),
    hasCap
  );

  return withProviderCostGuard({
    feature,
    estimatedCostUsd,
    run: async () => {
      const result = await transcribeAudio(file);
      const actualCostUsd = resolveEstimateOrFailClosed(
        () => calculateTranscriptionCostUsd({ model, durationSeconds: result.durationSeconds }),
        hasCap
      );

      return {
        result,
        actualCostUsd,
        metadata: {
          model,
          durationSeconds: result.durationSeconds,
          durationMinutes: Math.round((result.durationSeconds / 60) * 100) / 100,
          estimatedCostUsd: actualCostUsd,
        },
      };
    },
    recordUncapped: (actualCostUsd, metadata) =>
      recordUsageEvent({ eventType: "provider_cost", quantity: actualCostUsd, metadata }),
  });
}
