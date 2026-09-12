import "server-only";
import { z } from "zod";
import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import { buildAnalyzeExamplesPrompt } from "@/lib/ai/prompts/analyzeWritingExamples";
import type { DocumentType } from "@/types";

const analysisResultSchema = z.object({
  suggestedRules: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  suggestedAvoidRules: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  observations: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});

export type ExampleAnalysisResult = z.infer<typeof analysisResultSchema>;

function parseAnalysisResponse(raw: string): ExampleAnalysisResult {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return analysisResultSchema.parse(parsed);
}

/**
 * Analyzes user-supplied writing examples and returns structured, reviewable
 * style suggestions. Never modifies a preset itself — the caller (the
 * wizard's Examples step) decides what, if anything, to add.
 */
export async function analyzeWritingExamples(input: {
  documentType: DocumentType;
  positiveExample?: string;
  negativeExample?: string;
}): Promise<ExampleAnalysisResult> {
  const { system, prompt } = buildAnalyzeExamplesPrompt(input);

  const raw = await generateText({ system, prompt, temperature: 0.3 });

  try {
    return parseAnalysisResponse(raw);
  } catch {
    throw new AiGenerationError("Could not analyze the examples. Please try again.");
  }
}
