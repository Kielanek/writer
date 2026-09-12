"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SECONDARY_KEYWORDS } from "@/lib/writing-engine/seoKeywords";

const MAX_KEYWORD_LENGTH = 100;

export function SeoKeywordInput({
  primaryKeyword,
  onPrimaryKeywordChange,
  secondaryKeywords,
  onSecondaryKeywordsChange,
}: {
  primaryKeyword: string;
  onPrimaryKeywordChange: (value: string) => void;
  secondaryKeywords: string[];
  onSecondaryKeywordsChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addSecondaryKeyword() {
    const trimmed = draft.trim();
    setDraft("");
    if (!trimmed) return;

    if (trimmed.length > MAX_KEYWORD_LENGTH) {
      setError(`Keyword must be ${MAX_KEYWORD_LENGTH} characters or fewer.`);
      return;
    }
    if (secondaryKeywords.length >= MAX_SECONDARY_KEYWORDS) {
      setError(`You can add up to ${MAX_SECONDARY_KEYWORDS} secondary keywords.`);
      return;
    }
    const isDuplicate =
      secondaryKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase()) ||
      trimmed.toLowerCase() === primaryKeyword.trim().toLowerCase();
    if (isDuplicate) {
      setError("That keyword has already been added.");
      return;
    }

    setError(null);
    onSecondaryKeywordsChange([...secondaryKeywords, trimmed]);
  }

  function removeSecondaryKeyword(keyword: string) {
    onSecondaryKeywordsChange(secondaryKeywords.filter((k) => k !== keyword));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="primary-keyword">Primary Keyword</Label>
        <Input
          id="primary-keyword"
          value={primaryKeyword}
          onChange={(e) => onPrimaryKeywordChange(e.target.value)}
          placeholder="e.g. digital products on Etsy"
          maxLength={MAX_KEYWORD_LENGTH}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          The main term this article should target. Used naturally throughout, not forced.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="secondary-keyword">Secondary Keywords (optional to add)</Label>
        <Input
          id="secondary-keyword"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSecondaryKeyword();
            }
          }}
          onBlur={() => {
            if (draft.trim()) addSecondaryKeyword();
          }}
          placeholder="Type a keyword and press Enter"
          maxLength={MAX_KEYWORD_LENGTH}
          disabled={secondaryKeywords.length >= MAX_SECONDARY_KEYWORDS}
        />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Every keyword you add will be included naturally in the article.
          </p>
        )}

        {secondaryKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {secondaryKeywords.map((keyword) => (
              <span
                key={keyword}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-3 pr-1.5 text-sm"
                )}
              >
                {keyword}
                <button
                  type="button"
                  aria-label={`Remove ${keyword}`}
                  onClick={() => removeSecondaryKeyword(keyword)}
                  className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
