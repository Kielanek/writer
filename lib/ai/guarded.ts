import "server-only";
import { generateText, type TextGenerationResult } from "@/lib/ai/generateText";
import { transcribeAudio, type TranscriptionResult } from "@/lib/ai/transcribeAudio";
import { env } from "@/lib/env";
import {
  calculateTextCostUsd,
  estimateTokensFromText,
  FEATURE_COST_GUARDS,
  type CostGuardedFeature,
} from "@/lib/entitlements/cost";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getProfileForUser } from "@/lib/entitlements/profile";
import { recordUsageEvent } from "@/lib/entitlements/usage";
import { resolveEstimateOrFailClosed, withProviderCostGuard } from "@/lib/entitlements/reservation";

/**
 * The ONLY way any product feature should call generateText() or
 * transcribeAudio() — see the module doc below for why.
 *
 * guardedGenerateText() gives every text call site, centrally:
 * 1. A conservative worst-case cost estimate BEFORE the OpenAI request.
 * 2. An atomic budget reservation for cost-capped plans (Starter) — see
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
 *
 * `billing` identifies WHOSE plan/budget this call draws from and WHO
 * actually triggered it — for a Project-scoped call these can differ (a
 * Member's action bills the Project Owner) — see the collaboration model's
 * "usage is charged to the Owner" rule. For a non-project call (e.g.
 * Analyze Examples), pass the same id for both.
 *
 * guardedTranscribeAudio() is deliberately simpler — see its own doc
 * comment below: transcription is gated by minutes, not $, so none of the
 * above reservation/reconciliation machinery applies to it.
 */
export interface BillingContext {
  billingUserId: string;
  actorUserId: string;
  projectId?: string;
}

async function resolveCostCapContext(billingUserId: string): Promise<{ hasCap: boolean }> {
  const profile = await getProfileForUser(billingUserId);
  const limits = await getPlanLimits(profile.planId);
  return { hasCap: limits.apiCostBudgetUsd !== null };
}

export async function guardedGenerateText(
  feature: CostGuardedFeature,
  input: { system: string; prompt: string; temperature?: number },
  billing: BillingContext
): Promise<TextGenerationResult> {
  const { hasCap } = await resolveCostCapContext(billing.billingUserId);
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
    billingUserId: billing.billingUserId,
    actorUserId: billing.actorUserId,
    projectId: billing.projectId,
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
      recordUsageEvent({
        eventType: "provider_cost",
        quantity: actualCostUsd,
        metadata,
        billingUserId: billing.billingUserId,
        actorUserId: billing.actorUserId,
        projectId: billing.projectId,
      }),
  });
}

/**
 * Transcription is gated purely by the product-facing minutes cap
 * (checkTranscriptionAllowance() in lib/entitlements/usage.ts, enforced by
 * the /api/transcription route before this is ever called) — NOT by the
 * $ provider-cost budget. The currently-configured OPENAI_TRANSCRIPTION_MODEL
 * ("whisper-1") has no verified pricing (see provider-pricing.ts), so
 * tracking/reserving a $ cost for it would only ever be a guess; the
 * product decision is that the plan's minutes allowance is the whole limit,
 * full stop.
 */
export async function guardedTranscribeAudio(file: File): Promise<TranscriptionResult> {
  return transcribeAudio(file);
}
