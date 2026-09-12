"use client";

import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import {
  NEWSLETTER_STYLE_OPTIONS,
  NEWSLETTER_OPENING_STYLES,
  NEWSLETTER_ENDING_STYLES,
  NEWSLETTER_GREETING_OPTIONS,
  type NewsletterTypeSettings,
} from "@/lib/writing-engine/presetSettings";

const STYLE_LABELS: Record<string, string> = {
  personal: "Personal",
  educational: "Educational",
  story_lesson: "Story + lesson",
  opinion: "Opinion",
  flexible: "Flexible",
};
const OPENING_LABELS: Record<string, string> = {
  direct_idea: "Direct idea",
  personal_note: "Personal note",
  story: "Story",
  problem: "Problem",
  let_ai_choose: "Let AI choose",
};
const ENDING_LABELS: Record<string, string> = {
  natural_close: "Natural close",
  practical_takeaway: "Practical takeaway",
  question: "Question",
  cta: "CTA",
  no_forced_ending: "No forced ending",
};
const GREETING_LABELS: Record<string, string> = { none: "None", casual: "Casual", standard: "Standard" };

export function TypeFieldsNewsletter({
  settings,
  onChange,
}: {
  settings: NewsletterTypeSettings;
  onChange: (next: NewsletterTypeSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Style</Label>
        <SegmentedChoice
          options={NEWSLETTER_STYLE_OPTIONS.map((v) => ({ value: v, label: STYLE_LABELS[v] }))}
          value={settings.style}
          onChange={(v) => onChange({ ...settings, style: v as NewsletterTypeSettings["style"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Opening</Label>
        <SegmentedChoice
          options={NEWSLETTER_OPENING_STYLES.map((v) => ({ value: v, label: OPENING_LABELS[v] }))}
          value={settings.opening}
          onChange={(v) => onChange({ ...settings, opening: v as NewsletterTypeSettings["opening"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Ending</Label>
        <SegmentedChoice
          options={NEWSLETTER_ENDING_STYLES.map((v) => ({ value: v, label: ENDING_LABELS[v] }))}
          value={settings.ending}
          onChange={(v) => onChange({ ...settings, ending: v as NewsletterTypeSettings["ending"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Greeting</Label>
        <SegmentedChoice
          options={NEWSLETTER_GREETING_OPTIONS.map((v) => ({ value: v, label: GREETING_LABELS[v] }))}
          value={settings.greeting}
          onChange={(v) => onChange({ ...settings, greeting: v as NewsletterTypeSettings["greeting"] })}
        />
      </div>
    </div>
  );
}
