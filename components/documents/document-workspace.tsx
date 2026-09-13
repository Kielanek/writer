"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SaveStatus } from "@/components/save-status";
import { AiEditPanel } from "@/components/documents/ai-edit-panel";
import { VersionHistory } from "@/components/documents/version-history";
import {
  DocumentModeSwitch,
  defaultDocumentViewMode,
  type DocumentViewMode,
} from "@/components/documents/document-mode-switch";
import { DocumentPreview } from "@/components/documents/document-preview";
import { ArticleEditor } from "@/components/documents/article-editor";
import { LinkedInPostEditor } from "@/components/documents/linkedin-post-editor";
import { CopyButton } from "@/components/documents/copy-button";
import { SeoKeywordLegend } from "@/components/documents/seo-keyword-legend";
import { AddSeoKeywordsPanel } from "@/components/documents/add-seo-keywords-panel";
import { useAutosave } from "@/hooks/use-autosave";
import { formatRelativeTime } from "@/lib/utils/format";
import { resolveDocumentPresetSnapshot } from "@/lib/writing-engine/snapshot";
import { resolveDocumentSeoConfig } from "@/lib/writing-engine/seoKeywords";
import { normalizeLinkedInText } from "@/lib/utils/normalizeLinkedInText";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { Document, DocumentVersion } from "@/types";

export function DocumentWorkspace({
  document: initialDocument,
  initialVersions,
}: {
  document: Document;
  initialVersions: DocumentVersion[];
}) {
  const presetSnapshot = resolveDocumentPresetSnapshot(initialDocument);
  const [seoKeywords, setSeoKeywords] = useState(resolveDocumentSeoConfig(initialDocument));
  const router = useRouter();
  const [title, setTitle] = useState(initialDocument.title);
  const [content, setContent] = useState(initialDocument.content);
  const [versions, setVersions] = useState(initialVersions);
  const [savingVersion, setSavingVersion] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mode, setMode] = useState<DocumentViewMode>(defaultDocumentViewMode());
  const isLinkedIn = initialDocument.type === "linkedin_post";
  const isArticle = initialDocument.type === "article";

  function getCopyText(): string {
    return initialDocument.type === "linkedin_post" ? normalizeLinkedInText(content) : content;
  }

  async function saveField(field: "title" | "content", value: string) {
    const res = await fetch(`/api/documents/${initialDocument.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error("Save failed");
  }

  const titleStatus = useAutosave(title, (v) => saveField("title", v));
  const contentStatus = useAutosave(content, (v) => saveField("content", v));

  const overallStatus =
    [titleStatus, contentStatus].find((s) => s === "saving") ??
    [titleStatus, contentStatus].find((s) => s === "error") ??
    (titleStatus === "saved" || contentStatus === "saved" ? "saved" : "idle");

  async function handleSaveVersion() {
    setSavingVersion(true);
    try {
      const res = await fetch(`/api/documents/${initialDocument.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save version.");
      }
      const { version } = await res.json();
      setVersions((prev) => [version, ...prev]);
      toast.success(`Saved as v${version.version_number}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save version.");
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleAiEdit(instruction: string) {
    const res = await fetch(`/api/documents/${initialDocument.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(resolveApiErrorMessage(data, "Failed to apply the AI edit."));
    }
    const { version } = await res.json();
    setContent(version.content);
    setVersions((prev) => [version, ...prev]);
    toast.success(`AI edit applied — v${version.version_number}`);
  }

  async function handleRestore(target: DocumentVersion) {
    const res = await fetch(
      `/api/documents/${initialDocument.id}/versions/${target.version_number}/restore`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to restore version.");
    }
    const { version } = await res.json();
    setContent(version.content);
    setVersions((prev) => [version, ...prev]);
    toast.success(`Restored — new version v${version.version_number}`);
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/documents/${initialDocument.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete document.");
      }
      toast.success("Document deleted");
      router.push(`/projects/${initialDocument.project_id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete document.");
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[initialDocument.type]}</Badge>
          <Badge variant="outline">{presetSnapshot.name}</Badge>
          <span className="text-xs text-muted-foreground">
            Updated {formatRelativeTime(initialDocument.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus status={overallStatus} />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete document"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="doc-title">Title</Label>
        <Input
          id="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          className="text-lg font-semibold"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className={cn("flex flex-wrap items-center gap-2", isLinkedIn ? "justify-end" : "justify-between")}>
          {isLinkedIn ? null : <DocumentModeSwitch mode={mode} onChange={setMode} />}
          <div className="flex items-center gap-2">
            <CopyButton getText={getCopyText} />
            <Button variant="outline" size="sm" onClick={handleSaveVersion} disabled={savingVersion}>
              <Save className="size-4" />
              {savingVersion ? "Saving..." : "Save Version"}
            </Button>
          </div>
        </div>

        {isLinkedIn ? (
          <LinkedInPostEditor content={content} onChange={setContent} />
        ) : mode === "edit" ? (
          <>
            <Label htmlFor="doc-content" className="sr-only">
              Content
            </Label>
            <Textarea
              id="doc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              maxLength={200_000}
              className="font-normal leading-relaxed"
            />
          </>
        ) : isArticle ? (
          <div className="flex flex-col gap-3">
            {seoKeywords ? (
              <SeoKeywordLegend content={content} seoKeywords={seoKeywords} />
            ) : (
              <AddSeoKeywordsPanel documentId={initialDocument.id} onSaved={setSeoKeywords} />
            )}
            <div className="rounded-xl border bg-muted/20 px-3 py-5 sm:px-6">
              {/* Remount when keywords first appear (e.g. via "Add SEO Keywords" on a legacy
                  Article) — ArticleEditor freezes its highlight extension at mount time,
                  since keywords never change mid-session for a normal Article. */}
              <ArticleEditor
                key={seoKeywords ? "with-seo" : "no-seo"}
                content={content}
                onChange={setContent}
                seoKeywords={seoKeywords}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/20 px-3 py-5 sm:px-6">
            <DocumentPreview type={initialDocument.type} title={title} content={content} />
          </div>
        )}
      </div>

      <AiEditPanel onApply={handleAiEdit} />

      <Separator />

      <VersionHistory versions={versions} onRestore={handleRestore} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this document?"
        description="This will permanently delete the document and all of its version history. This cannot be undone."
        confirmLabel="Delete Document"
        onConfirm={handleDelete}
      />
    </div>
  );
}
