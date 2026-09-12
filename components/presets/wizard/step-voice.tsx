"use client";

import { Label } from "@/components/ui/label";
import { ChoiceChipGroup } from "@/components/presets/wizard/choice-chip-group";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import { VOICE_TRAITS, FORMALITY_OPTIONS, ASSERTIVENESS_OPTIONS, FIRST_PERSON_OPTIONS } from "@/lib/writing-engine/presetSettings";
import type { WizardState } from "@/components/presets/wizard/wizard-types";

const VOICE_OPTIONS = VOICE_TRAITS.map((v) => ({
  value: v,
  label: v
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-"),
}));

const FORMALITY_LABELS: Record<string, string> = { casual: "Casual", balanced: "Balanced", professional: "Professional" };
const ASSERTIVENESS_LABELS: Record<string, string> = { soft: "Soft", balanced: "Balanced", strong: "Strong opinions" };
const FIRST_PERSON_LABELS: Record<string, string> = {
  rarely: "Rarely",
  when_natural: "When natural",
  frequently: "Frequently",
};

export function StepVoice({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (next: Partial<WizardState>) => void;
}) {
  const s = state.settings;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Voice</Label>
        <span className="text-xs text-muted-foreground">Choose up to 3 characteristics.</span>
        <ChoiceChipGroup
          options={VOICE_OPTIONS}
          selected={s.voice}
          max={3}
          onChange={(voice) => onChange({ settings: { ...s, voice: voice as typeof s.voice } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Formality</Label>
        <SegmentedChoice
          options={FORMALITY_OPTIONS.map((v) => ({ value: v, label: FORMALITY_LABELS[v] }))}
          value={s.formality}
          onChange={(v) => onChange({ settings: { ...s, formality: v as typeof s.formality } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Assertiveness</Label>
        <SegmentedChoice
          options={ASSERTIVENESS_OPTIONS.map((v) => ({ value: v, label: ASSERTIVENESS_LABELS[v] }))}
          value={s.assertiveness}
          onChange={(v) => onChange({ settings: { ...s, assertiveness: v as typeof s.assertiveness } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>First person</Label>
        <SegmentedChoice
          options={FIRST_PERSON_OPTIONS.map((v) => ({ value: v, label: FIRST_PERSON_LABELS[v] }))}
          value={s.firstPerson}
          onChange={(v) => onChange({ settings: { ...s, firstPerson: v as typeof s.firstPerson } })}
        />
      </div>
    </div>
  );
}
