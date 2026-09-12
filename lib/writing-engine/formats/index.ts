import type { DocumentType } from "@/types";
import { LINKEDIN_FORMAT_RULES } from "./linkedin";
import { ARTICLE_FORMAT_RULES } from "./article";
import { YOUTUBE_FORMAT_RULES } from "./youtube";
import { NEWSLETTER_FORMAT_RULES } from "./newsletter";
import { SUMMARY_FORMAT_RULES } from "./summary";

/** Per-document-type writing rules. One list per format — never mixed across types. */
export const FORMAT_RULES: Record<DocumentType, string[]> = {
  linkedin_post: LINKEDIN_FORMAT_RULES,
  // SEO guidance is layered in separately via lib/writing-engine/seo/base.ts
  // — every Article generation includes it (see composeDocumentGenerationPrompt).
  article: ARTICLE_FORMAT_RULES,
  youtube_script: YOUTUBE_FORMAT_RULES,
  newsletter: NEWSLETTER_FORMAT_RULES,
  summary: SUMMARY_FORMAT_RULES,
};

export function getFormatRules(documentType: DocumentType): string[] {
  return FORMAT_RULES[documentType];
}
