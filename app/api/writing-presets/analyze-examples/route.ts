import { NextRequest, NextResponse } from "next/server";
import { analyzeWritingExamples } from "@/lib/ai/analyzeWritingExamples";
import { AiGenerationError } from "@/lib/ai/generateText";
import { analyzeExamplesSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

/**
 * Analyzes writing examples supplied during Preset Creator's guided wizard.
 * Purely advisory — returns suggestions for the user to review and
 * optionally add; never writes to a preset itself.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const input = analyzeExamplesSchema.parse(body);

  try {
    const result = await analyzeWritingExamples(input);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }
});
