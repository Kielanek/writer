"use client";

import { Label } from "@/components/ui/label";
import { ChoiceChipGroup } from "@/components/presets/wizard/choice-chip-group";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import {
  LINKEDIN_OPENING_STYLES,
  LINKEDIN_ENDING_STYLES,
  EMOJI_OPTIONS,
  HASHTAG_OPTIONS,
  type LinkedInTypeSettings,
} from "@/lib/writing-engine/presetSettings";

const OPENING_LABELS: Record<string, string> = {
  strong_observation: "Strong observation",
  clear_opinion: "Clear opinion",
  story_situation: "Story / situation",
  problem: "Problem",
  contrarian: "Contrarian statement",
  question: "Question",
  let_ai_choose: "Let AI choose naturally",
};
const ENDING_LABELS: Record<string, string> = {
  strong_conclusion: "Strong conclusion",
  practical_takeaway: "Practical takeaway",
  open_thought: "Open thought",
  question: "Question",
  cta: "CTA",
  let_it_end_naturally: "Let it end naturally",
};
const EMOJI_LABELS: Record<string, string> = { never: "Never", sparingly: "Sparingly", allowed: "Allowed" };
const HASHTAG_LABELS: Record<string, string> = { never: "Never", only_if_requested: "Only if requested", allowed: "Allowed" };
const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function TypeFieldsLinkedIn({
  settings,
  onChange,
}: {
  settings: LinkedInTypeSettings;
  onChange: (next: LinkedInTypeSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Opening style</Label>
        <span className="text-xs text-muted-foreground">Choose up to 3.</span>
        <ChoiceChipGroup
          options={LINKEDIN_OPENING_STYLES.map((v) => ({ value: v, label: OPENING_LABELS[v] }))}
          selected={settings.openingStyles}
          max={3}
          onChange={(v) => onChange({ ...settings, openingStyles: v as LinkedInTypeSettings["openingStyles"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Ending style</Label>
        <span className="text-xs text-muted-foreground">Choose up to 3.</span>
        <ChoiceChipGroup
          options={LINKEDIN_ENDING_STYLES.map((v) => ({ value: v, label: ENDING_LABELS[v] }))}
          selected={settings.endingStyles}
          max={3}
          onChange={(v) => onChange({ ...settings, endingStyles: v as LinkedInTypeSettings["endingStyles"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Avoid forced endings</Label>
        <span className="text-xs text-muted-foreground">
          Don&apos;t add a CTA, question, or summary only because the post is ending.
        </span>
        <SegmentedChoice
          options={ON_OFF}
          value={settings.avoidForcedEndings ? "on" : "off"}
          onChange={(v) => onChange({ ...settings, avoidForcedEndings: v === "on" })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Emojis</Label>
        <SegmentedChoice
          options={EMOJI_OPTIONS.map((v) => ({ value: v, label: EMOJI_LABELS[v] }))}
          value={settings.emojis}
          onChange={(v) => onChange({ ...settings, emojis: v as LinkedInTypeSettings["emojis"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Hashtags</Label>
        <SegmentedChoice
          options={HASHTAG_OPTIONS.map((v) => ({ value: v, label: HASHTAG_LABELS[v] }))}
          value={settings.hashtags}
          onChange={(v) => onChange({ ...settings, hashtags: v as LinkedInTypeSettings["hashtags"] })}
        />
      </div>
    </div>
  );
}
