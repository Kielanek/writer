import type { DocumentType } from "@/types";

/**
 * One-click suggested rules shown in the guided Preset Creator's Rules
 * step. Purely a UI convenience — clicking one just appends its text to the
 * user's rules/avoidRules list, same as typing it manually.
 */

const COMMON_SUGGESTED_RULES: string[] = [
  "Use specific examples where possible.",
  "Keep paragraph lengths naturally varied.",
];

const COMMON_SUGGESTED_AVOID_RULES: string[] = [
  "Avoid generic AI phrases.",
  "Avoid excessive rhetorical questions.",
  "Do not repeat conclusions.",
  "Avoid forced CTAs.",
  "Avoid fake controversy.",
];

const TYPE_SUGGESTED_RULES: Partial<Record<DocumentType, string[]>> = {
  linkedin_post: [],
  article: [],
  newsletter: [],
  summary: [],
};

const TYPE_SUGGESTED_AVOID_RULES: Partial<Record<DocumentType, string[]>> = {
  linkedin_post: [
    "Avoid LinkedIn broetry.",
    "Do not put every sentence in a separate paragraph.",
    "Avoid engagement bait.",
  ],
  article: [
    "Avoid excessive headings.",
    "Do not split coherent ideas into tiny paragraphs.",
    "Prefer prose over unnecessary lists.",
  ],
  newsletter: [],
  summary: [],
};

export function getSuggestedRules(documentType: DocumentType): string[] {
  return [...(TYPE_SUGGESTED_RULES[documentType] ?? []), ...COMMON_SUGGESTED_RULES];
}

export function getSuggestedAvoidRules(documentType: DocumentType): string[] {
  return [...(TYPE_SUGGESTED_AVOID_RULES[documentType] ?? []), ...COMMON_SUGGESTED_AVOID_RULES];
}
