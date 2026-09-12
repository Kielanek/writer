import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { env } from "@/lib/env";

export class AiGenerationError extends Error {}

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
 */
export async function generateText(input: {
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<string> {
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
        messages,
      });
    } catch (err) {
      // Some models (e.g. reasoning-tier models) only support the default
      // temperature and reject any explicit value. Retry once without it
      // rather than failing every writing operation on those models.
      if (!isUnsupportedTemperatureError(err)) throw err;
      response = await client.chat.completions.create({ model, messages });
    }

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new AiGenerationError("The AI returned an empty response.");
    }
    return text;
  } catch (err) {
    if (err instanceof AiGenerationError) throw err;
    throw new AiGenerationError(
      "The AI service is currently unavailable. Please try again."
    );
  }
}
