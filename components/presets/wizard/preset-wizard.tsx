"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardProgress } from "@/components/presets/wizard/wizard-progress";
import { StepBasics } from "@/components/presets/wizard/step-basics";
import { StepVoice } from "@/components/presets/wizard/step-voice";
import { StepStructure } from "@/components/presets/wizard/step-structure";
import { StepRules } from "@/components/presets/wizard/step-rules";
import { StepExamplesReview } from "@/components/presets/wizard/step-examples-review";
import type { WizardState } from "@/components/presets/wizard/wizard-types";
import type { DocumentType } from "@/types";

const STEP_TITLES = [
  "Basics",
  "Voice",
  "Structure",
  "Rules",
  "Examples & Review",
];

export function PresetWizard({
  documentType,
  initialState,
  existingPresetId,
}: {
  documentType: DocumentType;
  initialState: WizardState;
  /** Present when editing an existing custom preset; absent when creating (including duplicate-and-customize). */
  existingPresetId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(initialState);
  const [submitting, setSubmitting] = useState(false);

  function patch(next: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...next }));
  }

  const canProceedFromBasics = state.name.trim().length > 0;

  function goNext() {
    if (step === 1 && !canProceedFromBasics) return;
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!canProceedFromBasics || submitting) return;
    setSubmitting(true);

    try {
      const body = {
        documentType,
        name: state.name,
        description: state.description || null,
        rules: state.rules.filter((r) => r.trim()),
        avoidRules: state.avoidRules.filter((r) => r.trim()),
        settings: state.settings,
      };

      const res = await fetch(
        existingPresetId ? `/api/writing-presets/${existingPresetId}` : "/api/writing-presets",
        {
          method: existingPresetId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save the preset.");
      }

      toast.success(existingPresetId ? "Preset updated" : "Preset created");
      router.push("/presets");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the preset.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WizardProgress step={step} />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">{STEP_TITLES[step - 1]}</h2>
      </div>

      {step === 1 ? <StepBasics documentType={documentType} state={state} onChange={patch} /> : null}
      {step === 2 ? <StepVoice state={state} onChange={patch} /> : null}
      {step === 3 ? <StepStructure documentType={documentType} state={state} onChange={patch} /> : null}
      {step === 4 ? <StepRules documentType={documentType} state={state} onChange={patch} /> : null}
      {step === 5 ? <StepExamplesReview documentType={documentType} state={state} onChange={patch} /> : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={goBack} disabled={step === 1}>
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {step < 5 ? (
          <Button type="button" onClick={goNext} disabled={step === 1 && !canProceedFromBasics}>
            Next
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSave} disabled={!canProceedFromBasics || submitting}>
            {submitting ? "Saving..." : existingPresetId ? "Save Changes" : "Save Preset"}
          </Button>
        )}
      </div>
    </div>
  );
}
