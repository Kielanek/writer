import "server-only";
import { AiGenerationError } from "@/lib/ai/generateText";
import { guardedGenerateText } from "@/lib/ai/guarded";
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
 *
 * `repairFeature` distinguishes the generation-repair pass from the
 * edit-repair pass purely for provider-cost bookkeeping (see
 * lib/entitlements/cost.ts's FEATURE_COST_GUARDS) — both are automatic,
 * internal OpenAI calls: they never count as a second user-facing AI
 * Action, but their real cost always counts against the provider-cost
 * budget (see lib/ai/guarded.ts's module doc for why that split matters).
 */
async function ensureKeywordCoverage(params: {
  content: string;
  documentType: DocumentType;
  presetSnapshot: PresetSnapshot;
  context: ProjectContext;
  seoKeywords: SeoKeywordConfig;
  repairFeature: "document_generation_repair" | "document_edit_repair";
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
    const result = await guardedGenerateText(params.repairFeature, { system, prompt, temperature: 0.4 });
    repaired = result.text;
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

/**
 * Both exported functions below intentionally return the plain generated
 * string, not token usage — a document generation/edit is 1-2 generateText
 * calls (a main pass, plus an optional keyword-repair pass), and reporting
 * precise combined token counts isn't worth the complexity given usage
 * limits are action-counted, not token-counted (see
 * lib/entitlements/usage.ts). Each call still records its own real
 * provider cost independently via lib/ai/guarded.ts — see
 * ensureKeywordCoverage's doc comment.
 */
export async function generateDocumentContent(input: {
  context: ProjectContext;
  documentType: DocumentType;
  instructions: string;
  presetSnapshot: PresetSnapshot;
  seoKeywords: SeoKeywordConfig | null;
}): Promise<string> {
  const { system, prompt } = composeDocumentGenerationPrompt(input);
  const { text: content } = await guardedGenerateText("document_generation", { system, prompt, temperature: 0.7 });

  if (!input.seoKeywords) return content;

  return ensureKeywordCoverage({
    content,
    documentType: input.documentType,
    presetSnapshot: input.presetSnapshot,
    context: input.context,
    seoKeywords: input.seoKeywords,
    repairFeature: "document_generation_repair",
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
  const { text: content } = await guardedGenerateText("document_edit", { system, prompt, temperature: 0.6 });

  if (!input.seoKeywords) return content;

  return ensureKeywordCoverage({
    content,
    documentType: input.documentType,
    presetSnapshot: input.presetSnapshot,
    context: input.context,
    seoKeywords: input.seoKeywords,
    repairFeature: "document_edit_repair",
  });
}
