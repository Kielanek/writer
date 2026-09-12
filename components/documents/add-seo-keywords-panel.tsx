"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeoKeywordInput } from "@/components/documents/seo-keyword-input";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

/**
 * Shown on a legacy Article (created before SEO keywords became mandatory)
 * that has no seo_settings yet. Lets the user add them after the fact
 * without blocking access to the document in the meantime.
 */
export function AddSeoKeywordsPanel({
  documentId,
  onSaved,
}: {
  documentId: string;
  onSaved: (seoKeywords: SeoKeywordConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add SEO Keywords
      </Button>
    );
  }

  async function handleSave() {
    if (!primaryKeyword.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seoSettings: { primaryKeyword, secondaryKeywords } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save SEO keywords.");
      }
      const { document } = await res.json();
      toast.success("SEO keywords added");
      onSaved(document.seo_settings as SeoKeywordConfig);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save SEO keywords.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div>
        <div className="text-sm font-medium">Add SEO Keywords</div>
        <div className="text-xs text-muted-foreground">
          This Article was created before SEO keywords were required. Add them to enable keyword highlighting and usage counts.
        </div>
      </div>

      <SeoKeywordInput
        primaryKeyword={primaryKeyword}
        onPrimaryKeywordChange={setPrimaryKeyword}
        secondaryKeywords={secondaryKeywords}
        onSecondaryKeywordsChange={setSecondaryKeywords}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!primaryKeyword.trim() || saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save Keywords"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
