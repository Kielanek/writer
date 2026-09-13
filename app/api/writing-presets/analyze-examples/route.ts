import { NextRequest, NextResponse } from "next/server";
import { analyzeWritingExamples } from "@/lib/ai/analyzeWritingExamples";
import { AiGenerationError } from "@/lib/ai/generateText";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { analyzeExamplesSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";

/**
 * Analyzes writing examples supplied during Preset Creator's guided wizard.
 * Purely advisory — returns suggestions for the user to review and
 * optionally add; never writes to a preset itself. Spends OpenAI money, so
 * it must require auth even though it touches no Supabase table itself.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  await requireUser();

  const body = await request.json();
  const input = analyzeExamplesSchema.parse(body);

  await checkAiActionLimit();

  try {
    const result = await analyzeWritingExamples(input);

    // Real provider cost for this call was already recorded by
    // guardedGenerateText (lib/ai/guarded.ts) as its own provider_cost
    // event — this is only the user-facing product counter.
    await recordUsageEvent({
      eventType: "ai_action",
      quantity: 1,
      metadata: { feature: "analyze_examples" },
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }
});
