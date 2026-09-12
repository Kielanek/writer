"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { DocumentType } from "@/types";
import type { WizardState } from "@/components/presets/wizard/wizard-types";
import type { ExampleAnalysisResult } from "@/lib/ai/analyzeWritingExamples";

function readable(value: string): string {
  return value.replace(/_/g, " ");
}

function titleCase(value: string): string {
  const r = readable(value);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function StepExamplesReview({
  documentType,
  state,
  onChange,
}: {
  documentType: DocumentType;
  state: WizardState;
  onChange: (next: Partial<WizardState>) => void;
}) {
  const [positiveExample, setPositiveExample] = useState("");
  const [negativeExample, setNegativeExample] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [result, setResult] = useState<ExampleAnalysisResult | null>(null);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [selectedAvoidRules, setSelectedAvoidRules] = useState<Set<string>>(new Set());

  async function handleAnalyze() {
    if (!positiveExample.trim() && !negativeExample.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/writing-presets/analyze-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          positiveExample: positiveExample.trim() || undefined,
          negativeExample: negativeExample.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to analyze examples.");
      }
      const data: ExampleAnalysisResult = await res.json();
      setResult(data);
      setSelectedRules(new Set(data.suggestedRules));
      setSelectedAvoidRules(new Set(data.suggestedAvoidRules));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to analyze examples.");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  function addSelectedSuggestions() {
    const existingRules = new Set(state.rules.map((r) => r.trim()));
    const existingAvoid = new Set(state.avoidRules.map((r) => r.trim()));
    const newRules = [...state.rules.filter((r) => r.trim())];
    const newAvoid = [...state.avoidRules.filter((r) => r.trim())];

    for (const rule of selectedRules) {
      if (!existingRules.has(rule)) newRules.push(rule);
    }
    for (const rule of selectedAvoidRules) {
      if (!existingAvoid.has(rule)) newAvoid.push(rule);
    }

    onChange({ rules: newRules, avoidRules: newAvoid });
    setResult(null);
    setPositiveExample("");
    setNegativeExample("");
  }

  const s = state.settings;
  const openingStyles = s.typeSpecific.documentType === "linkedin_post" ? s.typeSpecific.openingStyles : [];
  const endingStyles = s.typeSpecific.documentType === "linkedin_post" ? s.typeSpecific.endingStyles : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Examples */}
      <div className="flex flex-col gap-5">
        <h3 className="text-sm font-semibold text-foreground">Examples (optional)</h3>

        <div className="flex flex-col gap-2">
          <Label htmlFor="example-like">Example I like</Label>
          <span className="text-xs text-muted-foreground">
            Paste a piece of writing that represents the style you want.
          </span>
          <Textarea
            id="example-like"
            value={positiveExample}
            onChange={(e) => setPositiveExample(e.target.value)}
            rows={5}
            maxLength={8000}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="example-dislike">Example I don&apos;t like</Label>
          <span className="text-xs text-muted-foreground">
            Paste something that represents what you want to avoid.
          </span>
          <Textarea
            id="example-dislike"
            value={negativeExample}
            onChange={(e) => setNegativeExample(e.target.value)}
            rows={5}
            maxLength={8000}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={(!positiveExample.trim() && !negativeExample.trim()) || analyzing}
          onClick={handleAnalyze}
        >
          {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {analyzing ? "Analyzing..." : "Analyze Examples"}
        </Button>

        {analysisError ? <p className="text-sm text-destructive">{analysisError}</p> : null}

        {result ? (
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
            {result.observations.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detected patterns
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {result.observations.map((o, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="size-3.5 shrink-0 text-emerald-600" />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.suggestedRules.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested rules to add
                </div>
                <div className="flex flex-col gap-1.5">
                  {result.suggestedRules.map((rule) => (
                    <label key={rule} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedRules.has(rule)}
                        onChange={() => toggle(selectedRules, setSelectedRules, rule)}
                        className="size-4 accent-foreground"
                      />
                      {rule}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {result.suggestedAvoidRules.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested avoid-rules to add
                </div>
                <div className="flex flex-col gap-1.5">
                  {result.suggestedAvoidRules.map((rule) => (
                    <label key={rule} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedAvoidRules.has(rule)}
                        onChange={() => toggle(selectedAvoidRules, setSelectedAvoidRules, rule)}
                        className="size-4 accent-foreground"
                      />
                      {rule}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="self-start"
              disabled={selectedRules.size === 0 && selectedAvoidRules.size === 0}
              onClick={addSelectedSuggestions}
            >
              <Plus className="size-4" />
              Add selected suggestions to preset
            </Button>
          </div>
        ) : null}
      </div>

      <div className="h-px bg-border" />

      {/* Review */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">Review</h3>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-base font-semibold">{state.name || "(untitled preset)"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[documentType]}</div>

          <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {s.purpose ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Purpose</dt>
                <dd className="text-sm">{s.purpose}</dd>
              </div>
            ) : null}
            {s.audience ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Audience</dt>
                <dd className="text-sm">{s.audience}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Voice</dt>
              <dd className="text-sm">{s.voice.length ? s.voice.map(titleCase).join(" · ") : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Formality</dt>
              <dd className="text-sm">{titleCase(s.formality)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Assertiveness</dt>
              <dd className="text-sm">{titleCase(s.assertiveness)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Length</dt>
              <dd className="text-sm">
                {s.length.mode === "custom" && s.length.min != null && s.length.max != null
                  ? `${s.length.min}-${s.length.max} ${s.length.unit}`
                  : titleCase(s.length.mode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Paragraphs</dt>
              <dd className="text-sm">{titleCase(s.paragraphStyle)}</dd>
            </div>
            {openingStyles.length > 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Opening</dt>
                <dd className="text-sm">{openingStyles.map(titleCase).join(" / ")}</dd>
              </div>
            ) : null}
            {endingStyles.length > 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Ending</dt>
                <dd className="text-sm">{endingStyles.map(titleCase).join(" / ")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Rules</dt>
              <dd className="text-sm">{state.rules.filter((r) => r.trim()).length}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Avoid</dt>
              <dd className="text-sm">{state.avoidRules.filter((r) => r.trim()).length}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
