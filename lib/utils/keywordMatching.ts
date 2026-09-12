import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

/**
 * Shared, deliberately simple keyword-matching logic for Article keyword
 * highlighting, usage counts, and generation/edit keyword-coverage
 * enforcement. Case-insensitive, whole-phrase (word-boundary) matching —
 * never partial-word fragments, never expensive NLP. Works directly against
 * raw text (Markdown source or a Tiptap text node's plain text) since
 * Markdown syntax characters (#, *, _, etc.) are never letters/digits, so
 * they naturally act as boundaries too.
 *
 * This is the ONE place keyword matching is implemented — Preview
 * highlighting, the keyword legend's occurrence counts, and post-generation
 * keyword-coverage validation (lib/ai/documentGeneration.ts) all call into
 * these same functions, so "found" always means the same thing everywhere.
 */

export function normalizeKeyword(keyword: string): string {
  return keyword.trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A fresh, global, case-insensitive, word-boundary regex for one keyword phrase. */
export function buildKeywordRegex(keyword: string): RegExp {
  const escaped = escapeRegExp(normalizeKeyword(keyword));
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

export function countKeywordOccurrences(text: string, keyword: string): number {
  const trimmed = normalizeKeyword(keyword);
  if (!trimmed) return 0;
  const matches = text.match(buildKeywordRegex(trimmed));
  return matches ? matches.length : 0;
}

export interface KeywordCoverageEntry {
  keyword: string;
  count: number;
  found: boolean;
}

export interface KeywordCoverage {
  primary: KeywordCoverageEntry;
  secondary: KeywordCoverageEntry[];
  /** Every required keyword (primary + every provided secondary) not found at least once. */
  missingKeywords: string[];
}

/**
 * Checks whether every keyword in an Article's SEO configuration actually
 * appears in its content — the primary keyword and every user-provided
 * secondary keyword are all required (secondary keywords are optional to
 * *add*, never optional to *use* once added).
 */
export function getKeywordCoverage(content: string, seoKeywords: SeoKeywordConfig): KeywordCoverage {
  const toEntry = (keyword: string): KeywordCoverageEntry => {
    const count = countKeywordOccurrences(content, keyword);
    return { keyword, count, found: count > 0 };
  };

  const primary = toEntry(seoKeywords.primaryKeyword);
  const secondary = seoKeywords.secondaryKeywords.map(toEntry);
  const missingKeywords = [primary, ...secondary].filter((entry) => !entry.found).map((entry) => entry.keyword);

  return { primary, secondary, missingKeywords };
}

/** Convenience wrapper over getKeywordCoverage for callers that only need the missing list. */
export function getMissingKeywords(content: string, seoKeywords: SeoKeywordConfig): string[] {
  return getKeywordCoverage(content, seoKeywords).missingKeywords;
}
