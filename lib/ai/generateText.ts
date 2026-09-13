import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { env } from "@/lib/env";

export class AiGenerationError extends Error {}

export interface TextGenerationUsage {
  model: string;
  inputTokens: number;
  /** Portion of inputTokens billed at the (cheaper) cached-input rate — see lib/entitlements/cost.ts. 0 if the provider reported no cache hit. */
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * Informational only — NOT added to outputTokens for cost purposes.
   * OpenAI's own docs are explicit that reasoning tokens are already
   * included inside `completion_tokens` (== outputTokens here) for
   * billing; this field exists purely for analytics on how much of the
   * output was "thinking" vs. visible text.
   */
  reasoningTokens: number;
}

export interface TextGenerationResult {
  text: string;
  /** Absent if the provider response didn't include usage (shouldn't normally happen, but never block on it). */
  usage: TextGenerationUsage | null;
}

/** True for the specific 400 OpenAI returns when a model doesn't support a custom `temperature`. */
function isUnsupportedTemperatureError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "param" in err &&
    (err as { param?: unknown }).param === "temperature"
  );
}

/**
 * Single entry point for all plain-text LLM generation (metadata,
 * document generation/editing, Ask Project). Keeps model choice and
 * request shape in one place.
 *
 * `maxOutputTokens`, when given, is passed to the provider as a REAL cap
 * (`max_completion_tokens`) — not just used locally for a cost estimate.
 * This matters: lib/ai/guarded.ts's pre-call budget reservation assumes
 * worst-case output equal to this same number, and that assumption is only
 * actually safe if the live request enforces it too. See
 * lib/entitlements/cost.ts's FEATURE_COST_GUARDS for the per-feature values.
 */
export async function generateText(input: {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<TextGenerationResult> {
  const client = getOpenAIClient();
  const model = env.openaiTextModel();
  const messages = [
    { role: "system" as const, content: input.system },
    { role: "user" as const, content: input.prompt },
  ];

  try {
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        temperature: input.temperature ?? 0.7,
        max_completion_tokens: input.maxOutputTokens,
        messages,
      });
    } catch (err) {
      // Some models (e.g. reasoning-tier models) only support the default
      // temperature and reject any explicit value. Retry once without it
      // rather than failing every writing operation on those models.
      if (!isUnsupportedTemperatureError(err)) throw err;
      response = await client.chat.completions.create({
        model,
        max_completion_tokens: input.maxOutputTokens,
        messages,
      });
    }

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new AiGenerationError("The AI returned an empty response.");
    }

    const usage: TextGenerationUsage | null = response.usage
      ? {
          model: response.model,
          inputTokens: response.usage.prompt_tokens,
          cachedInputTokens: response.usage.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          reasoningTokens: response.usage.completion_tokens_details?.reasoning_tokens ?? 0,
        }
      : null;

    return { text, usage };
  } catch (err) {
    if (err instanceof AiGenerationError) throw err;
    throw new AiGenerationError(
      "The AI service is currently unavailable. Please try again."
    );
  }
}
