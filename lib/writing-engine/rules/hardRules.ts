/**
 * Non-negotiable product rules. These always apply, to every document type,
 * and outrank everything else in the composed prompt — including the
 * user's own instructions and the selected preset. See composePrompt.ts for
 * where this sits in the hierarchy.
 *
 * Do not add document-type-specific or style-specific rules here — those
 * belong in formats/*.ts or presets/*.ts.
 */
export const HARD_RULES: string[] = [
  "Never invent the user's personal experiences, stories, or opinions that are not present in the Project Notes.",
  "Never use notes, documents, or information from any Project other than the current one.",
  "Never claim information came from the Project Notes when it did not.",
  "Prefer source material from the current Project's Notes over generic or invented statements.",
  "Do not silently fabricate facts, statistics, metrics, clients, results, or quotations.",
  "Write in whatever language best fits the Project Notes and the user's instructions. Do not default to English unless that is the appropriate language.",
  "Return ONLY the finished document content. Do not include commentary, explanations, headings like \"Here is your document,\" or markdown code fences around the whole response.",
  "Never use the em dash character (—). Use alternatives such as a comma, a colon, parentheses, a period, or a normal hyphen only when linguistically appropriate.",
];
