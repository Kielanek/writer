"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Mail, Newspaper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SeoKeywordInput } from "@/components/documents/seo-keyword-input";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import { CREATABLE_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/types";
import type { CreatableDocumentType, DocumentType } from "@/types";
import type { BuiltInPreset, CustomPresetRecord } from "@/lib/writing-engine/types";

const DOCUMENT_TYPE_HINTS: Record<CreatableDocumentType, string> = {
  linkedin_post: "A short, scannable post",
  article: "A long-form written piece, targeted to a keyword",
  newsletter: "An email to your list",
  summary: "A concise recap of your notes",
};

const DOCUMENT_TYPE_ICONS: Record<CreatableDocumentType, typeof FileText> = {
  linkedin_post: FileText,
  article: Newspaper,
  newsletter: Mail,
  summary: Sparkles,
};

type Step = "type" | "seo" | "preset" | "instructions";

export function CreateDocumentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<DocumentType | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [presets, setPresets] = useState<{ builtIn: BuiltInPreset[]; custom: CustomPresetRecord[] } | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(false);

  function loadPresetsFor(nextType: DocumentType) {
    setPresetId(null);
    setPresetName(null);
    setPresets(null);
    setStep("preset");

    setLoadingPresets(true);
    fetch(`/api/writing-presets?documentType=${nextType}`)
      .then((res) => res.json())
      .then((data) => setPresets(data))
      .catch(() => toast.error("Failed to load writing presets."))
      .finally(() => setLoadingPresets(false));
  }

  // Every Article is SEO-focused, so selecting Article always goes to the
  // keyword step first — there is no SEO toggle and no separate "SEO
  // Article" type to choose instead.
  function selectType(nextType: DocumentType) {
    setType(nextType);
    if (nextType === "article") {
      setStep("seo");
    } else {
      loadPresetsFor(nextType);
    }
  }

  function selectPreset(id: string, name: string) {
    setPresetId(id);
    setPresetName(name);
    setStep("instructions");
  }

  async function handleGenerate() {
    if (!type || !presetId || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type,
          presetId,
          instructions,
          seoSettings: type === "article" ? { primaryKeyword, secondaryKeywords } : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to generate the document."));
      }

      const { document } = await res.json();
      toast.success("Document generated");
      router.push(`/projects/${projectId}/documents/${document.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate the document.");
      setSubmitting(false);
    }
  }

  if (step === "type") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CREATABLE_DOCUMENT_TYPES.map((optionType) => {
          const Icon = DOCUMENT_TYPE_ICONS[optionType];
          return (
            <button
              key={optionType}
              type="button"
              onClick={() => selectType(optionType)}
              className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/30"
            >
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4" />
              </div>
              <div>
                <div className="font-medium">{DOCUMENT_TYPE_LABELS[optionType]}</div>
                <div className="text-sm text-muted-foreground">{DOCUMENT_TYPE_HINTS[optionType]}</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (step === "seo" && type === "article") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStep("type")}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Change type
        </button>

        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
          {DOCUMENT_TYPE_LABELS[type]}
        </div>

        <h2 className="text-sm font-medium text-muted-foreground">SEO Keywords</h2>

        <SeoKeywordInput
          primaryKeyword={primaryKeyword}
          onPrimaryKeywordChange={setPrimaryKeyword}
          secondaryKeywords={secondaryKeywords}
          onSecondaryKeywordsChange={setSecondaryKeywords}
        />

        <Button size="lg" disabled={!primaryKeyword.trim()} onClick={() => loadPresetsFor(type)}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === "preset" && type) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStep(type === "article" ? "seo" : "type")}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {type === "article" ? "Change keywords" : "Change type"}
        </button>

        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
          {DOCUMENT_TYPE_LABELS[type]}
        </div>

        <h2 className="text-sm font-medium text-muted-foreground">Choose a Writing Preset</h2>

        {loadingPresets ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading presets...
          </div>
        ) : presets ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Built-in
              </h3>
              <div className="flex flex-col gap-2">
                {presets.builtIn.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset.id, preset.label)}
                    className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/30"
                  >
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-sm text-muted-foreground">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {presets.custom.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your Presets
                </h3>
                <div className="flex flex-col gap-2">
                  {presets.custom.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectPreset(preset.id, preset.name)}
                      className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/30"
                    >
                      <div className="font-medium">{preset.name}</div>
                      {preset.description ? (
                        <div className="text-sm text-muted-foreground">{preset.description}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "instructions" && type && presetId) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStep("preset")}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
          disabled={submitting}
        >
          <ArrowLeft className="size-4" />
          Change preset
        </button>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
            {DOCUMENT_TYPE_LABELS[type]}
          </div>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
            {presetName}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="instructions">Additional Instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Describe what you want the AI to create. You can specify tone, structure, length, audience or anything else."
            rows={6}
            maxLength={5000}
            autoFocus
          />
        </div>

        <Button size="lg" onClick={handleGenerate} disabled={submitting}>
          {submitting ? "Generating document..." : "Generate"}
        </Button>
      </div>
    );
  }

  return null;
}
