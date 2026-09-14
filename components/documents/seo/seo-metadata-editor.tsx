"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/documents/copy-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SaveStatus } from "@/components/save-status";
import { SerpPreview } from "@/components/documents/seo/serp-preview";
import {
  SERP_TITLE_GUIDANCE,
  SERP_DESCRIPTION_GUIDANCE,
  SERP_LENGTH_LABELS,
  SERP_LENGTH_COLOR_CLASSES,
  classifyLength,
} from "@/components/documents/seo/serp-config";
import { useAutosave } from "@/hooks/use-autosave";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import { countKeywordOccurrences } from "@/lib/utils/keywordMatching";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

function KeywordStatus({ text, primaryKeyword }: { text: string; primaryKeyword: string }) {
  const included = text.trim().length > 0 && countKeywordOccurrences(text, primaryKeyword) > 0;
  return (
    <span className={cn("text-xs", included ? "text-emerald-600" : "text-muted-foreground")}>
      Primary keyword: {included ? "Included" : "Missing"}
    </span>
  );
}

function LengthBadge({ length, guidance }: { length: number; guidance: { concise: number; long: number } }) {
  if (length === 0) return null;
  const state = classifyLength(length, guidance);
  return <span className={cn("text-xs", SERP_LENGTH_COLOR_CLASSES[state])}>{SERP_LENGTH_LABELS[state]}</span>;
}

export function SeoMetadataEditor({
  documentId,
  documentTitle,
  seoKeywords,
  onSeoKeywordsChange,
}: {
  documentId: string;
  documentTitle: string;
  seoKeywords: SeoKeywordConfig;
  onSeoKeywordsChange: (next: SeoKeywordConfig) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);

  const metaTitle = seoKeywords.metaTitle ?? "";
  const metaDescription = seoKeywords.metaDescription ?? "";
  const hasExistingMeta = metaTitle.trim().length > 0 || metaDescription.trim().length > 0;

  async function saveSeoSettings(next: SeoKeywordConfig) {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seoSettings: next }),
    });
    if (!res.ok) throw new Error("Save failed");
  }

  const titleStatus = useAutosave(metaTitle, () => saveSeoSettings(seoKeywords));
  const descriptionStatus = useAutosave(metaDescription, () => saveSeoSettings(seoKeywords));
  const overallStatus =
    titleStatus === "saving" || descriptionStatus === "saving"
      ? "saving"
      : titleStatus === "error" || descriptionStatus === "error"
        ? "error"
        : titleStatus === "saved" || descriptionStatus === "saved"
          ? "saved"
          : "idle";

  async function runGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/generate-meta`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to generate SEO meta tags."));
      }
      const { document } = await res.json();
      onSeoKeywordsChange(document.seo_settings as SeoKeywordConfig);
      toast.success("SEO meta tags generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate SEO meta tags.");
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerateClick() {
    if (generating) return;
    // Manually-edited values are never silently overwritten — an explicit
    // confirmation is required once there's something to lose. A first-time
    // generation (nothing set yet) needs no confirmation.
    if (hasExistingMeta) {
      setConfirmRegenerateOpen(true);
    } else {
      runGenerate();
    }
  }

  const previewTitle = metaTitle.trim() || documentTitle || "Untitled article";
  const previewDescription =
    metaDescription.trim() || "Add a meta description to control how this article appears in search results.";

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">SEO Meta</h2>
          <p className="text-xs text-muted-foreground">
            Google may rewrite titles or snippets depending on the search query and page content.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus status={overallStatus} />
          <Button variant="outline" size="sm" onClick={handleGenerateClick} disabled={generating}>
            <Sparkles className="size-4" />
            {generating ? "Generating..." : hasExistingMeta ? "Regenerate Metadata" : "Generate with AI"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Label htmlFor="meta-title">Meta Title</Label>
          <div className="flex items-center gap-2">
            <KeywordStatus text={metaTitle} primaryKeyword={seoKeywords.primaryKeyword} />
            <span className="text-xs tabular-nums text-muted-foreground">{metaTitle.length} characters</span>
            <LengthBadge length={metaTitle.length} guidance={SERP_TITLE_GUIDANCE} />
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            id="meta-title"
            value={metaTitle}
            onChange={(e) => onSeoKeywordsChange({ ...seoKeywords, metaTitle: e.target.value })}
            placeholder={documentTitle || "e.g. 5 Mistakes Etsy Sellers Make (and How to Fix Them)"}
            maxLength={300}
            className="min-w-0 flex-1"
          />
          <CopyButton getText={() => metaTitle} />
        </div>
        <p className="text-xs text-muted-foreground">Recommended: keep it concise and click-worthy, not clickbait.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Label htmlFor="meta-description">Meta Description</Label>
          <div className="flex items-center gap-2">
            <KeywordStatus text={metaDescription} primaryKeyword={seoKeywords.primaryKeyword} />
            <span className="text-xs tabular-nums text-muted-foreground">{metaDescription.length} characters</span>
            <LengthBadge length={metaDescription.length} guidance={SERP_DESCRIPTION_GUIDANCE} />
          </div>
        </div>
        <div className="flex gap-2">
          <Textarea
            id="meta-description"
            value={metaDescription}
            onChange={(e) =>
              onSeoKeywordsChange({ ...seoKeywords, metaDescription: e.target.value.replace(/\n+/g, " ") })
            }
            placeholder="A short, compelling summary that makes someone want to click through from search results."
            rows={3}
            maxLength={500}
            className="min-w-0 flex-1"
          />
          <CopyButton getText={() => metaDescription} />
        </div>
        <p className="text-xs text-muted-foreground">
          Recommended: a concise, descriptive summary. Google may generate the displayed snippet from page content
          instead of this description.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Search Preview</p>
        <Tabs defaultValue="desktop">
          <TabsList>
            <TabsTrigger value="desktop">Desktop</TabsTrigger>
            <TabsTrigger value="mobile">Mobile</TabsTrigger>
          </TabsList>
          <TabsContent value="desktop">
            <SerpPreview title={previewTitle} description={previewDescription} path={documentTitle} device="desktop" />
          </TabsContent>
          <TabsContent value="mobile">
            <SerpPreview title={previewTitle} description={previewDescription} path={documentTitle} device="mobile" />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">Approximate preview — actual results may look different.</p>
      </div>

      <ConfirmDialog
        open={confirmRegenerateOpen}
        onOpenChange={setConfirmRegenerateOpen}
        title="Regenerate SEO metadata?"
        description="This will replace your current Meta Title and Meta Description with new AI-generated ones. This only affects metadata — the Article body is never regenerated."
        confirmLabel="Regenerate"
        destructive={false}
        onConfirm={runGenerate}
      />
    </section>
  );
}
