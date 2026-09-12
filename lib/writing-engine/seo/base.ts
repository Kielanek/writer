import type { SeoKeywordConfig } from "../seoKeywords";

/**
 * SEO rules are kept separate from Writing Presets on purpose: a preset
 * controls HOW to write (voice, structure, style); SEO keywords control
 * WHAT this specific Article targets. They compose independently — every
 * Article includes them (there is no SEO on/off toggle), and they never
 * become a "writing style" of their own. Returns no rules when keywords are
 * absent, which only happens for a legacy Article predating this feature.
 */
export function getSeoRules(seoKeywords: SeoKeywordConfig | null): string[] {
  if (!seoKeywords) return [];

  const rules: string[] = [
    "Write with search visibility in mind, without sacrificing natural readability. The article must still read like high-quality human editorial content, not search-engine copy.",
    "Use descriptive, scannable subheadings that reflect what a reader would search for.",
    "Make sure the opening paragraph clearly states what the reader will learn or get from this piece.",
    `The primary keyword is "${seoKeywords.primaryKeyword}". It must appear at least once in the article — preferably in the H1 heading when it fits naturally, and early in the article. Also use it again in relevant body content where it fits. Do not repeat it more than necessary, and do not force awkward exact-match phrasing just to reuse it.`,
  ];

  if (seoKeywords.secondaryKeywords.length > 0) {
    const list = seoKeywords.secondaryKeywords.map((k) => `"${k}"`).join(", ");
    rules.push(
      `Every one of these secondary keywords must also appear at least once, naturally, somewhere in the article: ${list}. This is a requirement, not a suggestion — each one has to be used, but only once is required, so do not repeat any of them unnecessarily. Distribute them across different parts of the article rather than clustering them together, and prefer semantic relevance over forcing several into the same sentence.`
    );
  }

  rules.push(
    "Never keyword-stuff: once a keyword has appeared the required number of times, do not keep repeating it just for the sake of repetition.",
    "Do not insert the primary or any secondary keyword into every heading — use them only where they genuinely belong.",
    "Never add a section, heading, or sentence whose only purpose is to list the keywords (for example, never write something like \"Keywords: ...\"). Every keyword must be woven into real sentences."
  );

  return rules;
}
