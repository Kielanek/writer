"use client";

import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import { LengthPicker } from "@/components/presets/wizard/length-picker";
import { TypeFieldsLinkedIn } from "@/components/presets/wizard/type-fields-linkedin";
import { TypeFieldsArticle } from "@/components/presets/wizard/type-fields-article";
import { TypeFieldsNewsletter } from "@/components/presets/wizard/type-fields-newsletter";
import { TypeFieldsSummary } from "@/components/presets/wizard/type-fields-summary";
import {
  PARAGRAPH_STYLE_OPTIONS,
  SENTENCE_RHYTHM_OPTIONS,
  LIST_USAGE_OPTIONS,
} from "@/lib/writing-engine/presetSettings";
import type { DocumentType } from "@/types";
import type { WizardState } from "@/components/presets/wizard/wizard-types";
import type { PresetSettings } from "@/lib/writing-engine/presetSettings";

const PARAGRAPH_LABELS: Record<string, string> = {
  short_punchy: "Short and punchy",
  natural_variation: "Natural variation",
  longer_editorial: "Longer editorial",
};
const RHYTHM_LABELS: Record<string, string> = {
  mostly_short: "Mostly short",
  mixed: "Mixed",
  more_detailed: "More detailed",
};
const LIST_LABELS: Record<string, string> = {
  avoid: "Avoid lists",
  when_useful: "When genuinely useful",
  often: "Use often",
};

export function StepStructure({
  documentType,
  state,
  onChange,
}: {
  documentType: DocumentType;
  state: WizardState;
  onChange: (next: Partial<WizardState>) => void;
}) {
  const s = state.settings;

  function updateSettings(patch: Partial<PresetSettings>) {
    onChange({ settings: { ...s, ...patch } });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Paragraph style</Label>
        <SegmentedChoice
          options={PARAGRAPH_STYLE_OPTIONS.map((v) => ({ value: v, label: PARAGRAPH_LABELS[v] }))}
          value={s.paragraphStyle}
          onChange={(v) => updateSettings({ paragraphStyle: v as typeof s.paragraphStyle })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Sentence rhythm</Label>
        <SegmentedChoice
          options={SENTENCE_RHYTHM_OPTIONS.map((v) => ({ value: v, label: RHYTHM_LABELS[v] }))}
          value={s.sentenceRhythm}
          onChange={(v) => updateSettings({ sentenceRhythm: v as typeof s.sentenceRhythm })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>List usage</Label>
        <SegmentedChoice
          options={LIST_USAGE_OPTIONS.map((v) => ({ value: v, label: LIST_LABELS[v] }))}
          value={s.listUsage}
          onChange={(v) => updateSettings({ listUsage: v as typeof s.listUsage })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Length</Label>
        <LengthPicker documentType={documentType} length={s.length} onChange={(length) => updateSettings({ length })} />
      </div>

      <div className="h-px bg-border" />

      {s.typeSpecific.documentType === "linkedin_post" ? (
        <TypeFieldsLinkedIn settings={s.typeSpecific} onChange={(typeSpecific) => updateSettings({ typeSpecific })} />
      ) : null}
      {s.typeSpecific.documentType === "article" ? (
        <TypeFieldsArticle settings={s.typeSpecific} onChange={(typeSpecific) => updateSettings({ typeSpecific })} />
      ) : null}
      {s.typeSpecific.documentType === "newsletter" ? (
        <TypeFieldsNewsletter settings={s.typeSpecific} onChange={(typeSpecific) => updateSettings({ typeSpecific })} />
      ) : null}
      {s.typeSpecific.documentType === "summary" ? (
        <TypeFieldsSummary settings={s.typeSpecific} onChange={(typeSpecific) => updateSettings({ typeSpecific })} />
      ) : null}
    </div>
  );
}
