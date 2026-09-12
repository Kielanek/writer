import "server-only";
import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import {
  composeDocumentEditPrompt,
  composeDocumentGenerationPrompt,
  composeKeywordRepairPrompt,
} from "@/lib/writing-engine/composePrompt";
import { getMissingKeywords } from "@/lib/utils/keywordMatching";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { PresetSnapshot } from "@/lib/writing-engine/types";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";
import type { DocumentType } from "@/types";

export { AiGenerationError };

/**
 * Runs at most one focused AI repair pass when a just-generated or
 * just-edited Article is missing one or more required keywords (the
 * primary keyword, or any user-provided secondary keyword — none of these
 * are optional once supplied, see lib/writing-engine/seo/base.ts). Bounded
 * on purpose: one repair attempt, then accept whatever coverage results
 * rather than looping. A repair failure (e.g. the AI service errors) falls
 * back to the original content instead of blocking generation/editing.
 */
async function ensureKeywordCoverage(params: {
  content: string;
  documentType: DocumentType;
  presetSnapshot: PresetSnapshot;
  context: ProjectContext;
  seoKeywords: SeoKeywordConfig;
}): Promise<string> {
  const missingKeywords = getMissingKeywords(params.content, params.seoKeywords);
  if (missingKeywords.length === 0) return params.content;

  let repaired: string;
  try {
    const { system, prompt } = composeKeywordRepairPrompt({
      documentType: params.documentType,
      presetSnapshot: params.presetSnapshot,
      context: params.context,
      currentContent: params.content,
      seoKeywords: params.seoKeywords,
      missingKeywords,
    });
    repaired = await generateText({ system, prompt, temperature: 0.4 });
  } catch (err) {
    console.error("Keyword repair pass failed; keeping the original content.", err);
    return params.content;
  }

  const stillMissing = getMissingKeywords(repaired, params.seoKeywords);
  if (stillMissing.length > 0) {
    console.warn(`Keyword repair pass could not include: ${stillMissing.join(", ")}`);
  }

  return repaired;
}

export async function generateDocumentContent(input: {
  context: ProjectContext;
  documentType: DocumentType;
  instructions: string;
  presetSnapshot: PresetSnapshot;
  seoKeywords: SeoKeywordConfig | null;
}): Promise<string> {
  const { system, prompt } = composeDocumentGenerationPrompt(input);
  const content = await generateText({ system, prompt, temperature: 0.7 });

  if (!input.seoKeywords) return content;

  return ensureKeywordCoverage({
    content,
    documentType: input.documentType,
    presetSnapshot: input.presetSnapshot,
    context: input.context,
    seoKeywords: input.seoKeywords,
  });
}

export async function generateDocumentEdit(input: {
  context: ProjectContext;
  documentType: DocumentType;
  currentContent: string;
  creationInstructions: string;
  editInstruction: string;
  presetSnapshot: PresetSnapshot;
  seoKeywords: SeoKeywordConfig | null;
}): Promise<string> {
  const { system, prompt } = composeDocumentEditPrompt(input);
  const content = await generateText({ system, prompt, temperature: 0.6 });

  if (!input.seoKeywords) return content;

  return ensureKeywordCoverage({
    content,
    documentType: input.documentType,
    presetSnapshot: input.presetSnapshot,
    context: input.context,
    seoKeywords: input.seoKeywords,
  });
}
