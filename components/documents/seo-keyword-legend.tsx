"use client";

import { cn } from "cn";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";
import { getKeywordCoverage } from "@/lib/utils/keywordMatching";
import { PRIMARY_DOT_CLASS, secondaryDotClass } from "@/components/documents/seo-keyword-colors";

function KeywordRow({ dotClassName, label, count }: { dotClassName: string; label: string; count: number }) {
  const found = count > 0;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} />
      <span className={cn(found ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-muted-foreground", found ? "" : "opacity-60")}>
        {found ? `✓ ${count}` : "○ Missing"}
      </span>
    </div>
  );
}

/**
 * Small, compact keyword-usage indicator for the Article preview —
 * intentionally not an SEO dashboard or score. Occurrence counts are
 * computed directly from the current Markdown content via the same
 * getKeywordCoverage helper that enforces keyword coverage after AI
 * generation/editing, so they stay in sync with both manual edits and AI
 * edits without any extra plumbing. A 0 count (e.g. after the user
 * manually deletes a keyword) is shown plainly as "Missing" — not an
 * error state — since manual editing is never auto-corrected.
 */
export function SeoKeywordLegend({ content, seoKeywords }: { content: string; seoKeywords: SeoKeywordConfig }) {
  const coverage = getKeywordCoverage(content, seoKeywords);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-muted/20 px-3 py-2">
      <KeywordRow
        dotClassName={PRIMARY_DOT_CLASS}
        label={coverage.primary.keyword}
        count={coverage.primary.count}
      />
      {coverage.secondary.map((entry, index) => (
        <KeywordRow
          key={entry.keyword}
          dotClassName={secondaryDotClass(index)}
          label={entry.keyword}
          count={entry.count}
        />
      ))}
    </div>
  );
}
