import { HARD_RULES } from "./rules/hardRules";
import { BASE_RULES } from "./rules/base";
import { getFormatRules } from "./formats";
import { getSeoRules } from "./seo/base";
import { compilePresetSettingsInstructions } from "./compilePresetSettings";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { DocumentType } from "@/types";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { ComposeEditInput, ComposeGenerationInput, ComposedPrompt, PresetSnapshot } from "./types";
import type { SeoKeywordConfig } from "./seoKeywords";

/**
 * THE single centralized prompt composer for document generation and AI
 * document editing. Only rules relevant to the current request are
 * included — e.g. a LinkedIn post never receives Article rules or SEO
 * rules. See lib/writing-engine/rules, formats, presets, and seo for the
 * individual rule sources this pulls together.
 *
 * Rule hierarchy (highest priority first):
 *   1. Hard product rules       — never overridden by anything below
 *   2. User's document instructions (carried in the user message, not here)
 *   3. Selected writing preset
 *   4. Document type rules
 *   5. Base writing rules
 */

function formatRuleSection(title: string, rules: string[]): string | null {
  if (rules.length === 0) return null;
  return `${title}:\n${rules.map((r) => `- ${r}`).join("\n")}`;
}

function buildSystemPrompt(input: {
  documentType: ComposeGenerationInput["documentType"];
  presetSnapshot: ComposeGenerationInput["presetSnapshot"];
  seoKeywords: ComposeGenerationInput["seoKeywords"];
  extraInstructions?: string[];
}): string {
  const { documentType, presetSnapshot, seoKeywords, extraInstructions } = input;

  // Guided Preset Creator questionnaire answers, compiled to readable
  // instructions. Absent for built-in presets and presets created before
  // this feature existed — those rely on `rules`/`avoidRules` alone, exactly
  // as before.
  const compiledSettings = presetSnapshot.settings
    ? compilePresetSettingsInstructions(presetSnapshot.settings, documentType)
    : "";

  const sections = [
    "You are a skilled ghostwriter helping a content creator turn their raw notes into finished content.",
    `Output format: ${DOCUMENT_TYPE_LABELS[documentType]}.`,
    formatRuleSection("HARD RULES (never override these)", HARD_RULES),
    formatRuleSection("BASE WRITING RULES", BASE_RULES),
    formatRuleSection("DOCUMENT TYPE RULES", getFormatRules(documentType)),
    compiledSettings ? `WRITING PRESET: ${presetSnapshot.name}\n\n${compiledSettings}` : null,
    formatRuleSection(
      compiledSettings ? `ADDITIONAL PRESET RULES (${presetSnapshot.name})` : `WRITING PRESET: ${presetSnapshot.name}`,
      presetSnapshot.rules
    ),
    formatRuleSection(`THINGS TO AVOID (${presetSnapshot.name})`, presetSnapshot.avoidRules),
    formatRuleSection("SEO RULES", getSeoRules(seoKeywords)),
    extraInstructions?.length ? formatRuleSection("EDITING INSTRUCTIONS", extraInstructions) : null,
  ].filter((s): s is string => Boolean(s));

  return sections.join("\n\n");
}

export function composeDocumentGenerationPrompt(input: ComposeGenerationInput): ComposedPrompt {
  const { context, instructions } = input;

  const system = buildSystemPrompt(input);

  const prompt = [
    `Project name: ${context.project.name}`,
    context.project.description ? `Project description: ${context.project.description}` : null,
    "",
    "Project Notes:",
    context.notesText || "(No notes yet.)",
    "",
    "User's instructions for this document:",
    instructions || "(No specific instructions provided. Use your best judgment.)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

export function composeDocumentEditPrompt(input: ComposeEditInput): ComposedPrompt {
  const { context, currentContent, creationInstructions, editInstruction } = input;

  const system = buildSystemPrompt({
    ...input,
    extraInstructions: [
      "Follow the user's requested change precisely.",
      "Preserve content that does not need to change. Do not rewrite the whole document unless asked to.",
      "Keep the document in the language it is currently written in, unless the user's instruction explicitly asks for a language change.",
    ],
  });

  const prompt = [
    `Project name: ${context.project.name}`,
    context.project.description ? `Project description: ${context.project.description}` : null,
    "",
    "Project Notes:",
    context.notesText || "(No notes yet.)",
    "",
    creationInstructions
      ? `Original instructions used to create this document:\n${creationInstructions}`
      : null,
    "",
    "Current document content:",
    currentContent,
    "",
    "User's requested edit:",
    editInstruction,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

export interface ComposeKeywordRepairInput {
  documentType: DocumentType;
  presetSnapshot: PresetSnapshot;
  context: ProjectContext;
  currentContent: string;
  seoKeywords: SeoKeywordConfig;
  missingKeywords: string[];
}

/**
 * A focused, bounded follow-up pass used only when a just-generated or
 * just-edited Article is missing one or more required keywords (see
 * lib/ai/documentGeneration.ts's ensureKeywordCoverage). Deliberately a
 * separate composer from composeDocumentEditPrompt rather than a synthetic
 * "user edit instruction" — this is a system-level repair, not a user
 * request, and needs its own explicit "don't just append a keyword list"
 * guardrail.
 */
export function composeKeywordRepairPrompt(input: ComposeKeywordRepairInput): ComposedPrompt {
  const { context, currentContent, missingKeywords } = input;
  const missingList = missingKeywords.map((k) => `"${k}"`).join(", ");

  const system = buildSystemPrompt({
    documentType: input.documentType,
    presetSnapshot: input.presetSnapshot,
    seoKeywords: input.seoKeywords,
    extraInstructions: [
      `The following required keyword(s) are currently missing from the article and must be added: ${missingList}.`,
      "Add each missing keyword naturally, integrated into a relevant existing sentence or a new sentence that fits the surrounding content — at least once each.",
      "Make the minimum changes necessary to include them. Do not rewrite the whole article.",
      'Do not add a new section, heading, or sentence whose only purpose is to list the keywords (for example, never write something like "Keywords: ...").',
      "Preserve the existing structure, headings, Markdown formatting, tone, length, and every keyword already used correctly.",
    ],
  });

  const prompt = [
    `Project name: ${context.project.name}`,
    context.project.description ? `Project description: ${context.project.description}` : null,
    "",
    "Current article content:",
    currentContent,
    "",
    `Missing required keyword(s) to add: ${missingList}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}
