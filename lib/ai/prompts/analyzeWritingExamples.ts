import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { DocumentType } from "@/types";

export interface ExampleAnalysisPrompt {
  system: string;
  prompt: string;
}

/**
 * Dedicated prompt for analyzing user-supplied writing examples during
 * Preset Creator's guided wizard. Deliberately kept separate from
 * lib/writing-engine/composePrompt.ts — this never touches document
 * generation or editing, and its output is a set of SUGGESTIONS the user
 * reviews and opts into, never applied automatically.
 */
export function buildAnalyzeExamplesPrompt(input: {
  documentType: DocumentType;
  positiveExample?: string;
  negativeExample?: string;
}): ExampleAnalysisPrompt {
  const { documentType, positiveExample, negativeExample } = input;

  const system = [
    "You are a writing style analyst helping a user define a reusable writing preset.",
    `The preset is for: ${DOCUMENT_TYPE_LABELS[documentType]}.`,
    "You will be shown one or both of: a piece of writing the user LIKES (wants to emulate), and a piece the user DISLIKES (wants to avoid).",
    "Analyze the STYLE only — tone, paragraph rhythm, sentence length, opening style, use of examples, use of lists, formality, first-person usage, rhetorical questions, call-to-action behavior, and patterns to avoid.",
    "Do NOT quote, copy, paraphrase, or reproduce any content, sentences, or phrases from the examples. Describe the style abstractly.",
    "Do not invent characteristics that aren't actually present in the examples.",
    "Respond ONLY with valid JSON, no markdown fences, matching exactly this shape:",
    '{"suggestedRules": string[], "suggestedAvoidRules": string[], "observations": string[]}',
    "suggestedRules: short, actionable 'always do' style rules (max 6), derived from the liked example if provided.",
    "suggestedAvoidRules: short, actionable 'never do' style rules (max 6), derived from the disliked example if provided, or from patterns the liked example clearly avoids.",
    "observations: short, plain-language observations a non-technical user would understand (max 6), e.g. 'Direct opening', 'Medium-length paragraphs', 'Limited list usage'.",
    "Keep every string under 100 characters. If only one example is provided, base suggestions on that one alone.",
  ].join("\n");

  const promptParts = [
    positiveExample ? `EXAMPLE I LIKE:\n"""\n${positiveExample}\n"""` : null,
    negativeExample ? `EXAMPLE I DON'T LIKE:\n"""\n${negativeExample}\n"""` : null,
  ].filter((p): p is string => Boolean(p));

  return { system, prompt: promptParts.join("\n\n") };
}
