"use client";

import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import { ChoiceChipGroup } from "@/components/presets/wizard/choice-chip-group";
import {
  SUMMARY_FORMAT_OPTIONS,
  SUMMARY_FOCUS_OPTIONS,
  type SummaryTypeSettings,
} from "@/lib/writing-engine/presetSettings";

const FORMAT_LABELS: Record<string, string> = {
  mostly_prose: "Mostly prose",
  mixed: "Mixed",
  mostly_bullets: "Mostly bullets",
};
const FOCUS_LABELS: Record<string, string> = {
  main_conclusions: "Main conclusions",
  key_ideas: "Key ideas",
  action_items: "Action items",
  examples: "Examples",
  open_questions: "Open questions",
  contradictions: "Contradictions",
};

export function TypeFieldsSummary({
  settings,
  onChange,
}: {
  settings: SummaryTypeSettings;
  onChange: (next: SummaryTypeSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Format</Label>
        <SegmentedChoice
          options={SUMMARY_FORMAT_OPTIONS.map((v) => ({ value: v, label: FORMAT_LABELS[v] }))}
          value={settings.format}
          onChange={(v) => onChange({ ...settings, format: v as SummaryTypeSettings["format"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Focus</Label>
        <span className="text-xs text-muted-foreground">Choose as many as apply.</span>
        <ChoiceChipGroup
          options={SUMMARY_FOCUS_OPTIONS.map((v) => ({ value: v, label: FOCUS_LABELS[v] }))}
          selected={settings.focus}
          onChange={(v) => onChange({ ...settings, focus: v as SummaryTypeSettings["focus"] })}
        />
      </div>
    </div>
  );
}
