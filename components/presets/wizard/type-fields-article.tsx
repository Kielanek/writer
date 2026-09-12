"use client";

import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import {
  ARTICLE_INTRO_STYLES,
  ARTICLE_HEADINGS_OPTIONS,
  ARTICLE_DEPTH_OPTIONS,
  ARTICLE_CONCLUSION_STYLES,
  type ArticleTypeSettings,
} from "@/lib/writing-engine/presetSettings";

const INTRO_LABELS: Record<string, string> = {
  answer_quickly: "Answer quickly",
  start_with_problem: "Start with the problem",
  start_with_example: "Start with an example",
  build_context_first: "Build context first",
  let_ai_choose: "Let AI choose naturally",
};
const HEADINGS_LABELS: Record<string, string> = { minimal: "Minimal", natural: "Natural", highly_structured: "Highly structured" };
const DEPTH_LABELS: Record<string, string> = { concise: "Concise", balanced: "Balanced", deep: "Deep" };
const CONCLUSION_LABELS: Record<string, string> = {
  clear_conclusion: "Clear conclusion",
  practical_next_steps: "Practical next steps",
  broader_implication: "Broader implication",
  no_forced_conclusion: "No forced conclusion",
};

export function TypeFieldsArticle({
  settings,
  onChange,
}: {
  settings: ArticleTypeSettings;
  onChange: (next: ArticleTypeSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Introduction style</Label>
        <SegmentedChoice
          options={ARTICLE_INTRO_STYLES.map((v) => ({ value: v, label: INTRO_LABELS[v] }))}
          value={settings.introStyle}
          onChange={(v) => onChange({ ...settings, introStyle: v as ArticleTypeSettings["introStyle"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Headings</Label>
        <SegmentedChoice
          options={ARTICLE_HEADINGS_OPTIONS.map((v) => ({ value: v, label: HEADINGS_LABELS[v] }))}
          value={settings.headings}
          onChange={(v) => onChange({ ...settings, headings: v as ArticleTypeSettings["headings"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Depth</Label>
        <SegmentedChoice
          options={ARTICLE_DEPTH_OPTIONS.map((v) => ({ value: v, label: DEPTH_LABELS[v] }))}
          value={settings.depth}
          onChange={(v) => onChange({ ...settings, depth: v as ArticleTypeSettings["depth"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Conclusion style</Label>
        <SegmentedChoice
          options={ARTICLE_CONCLUSION_STYLES.map((v) => ({ value: v, label: CONCLUSION_LABELS[v] }))}
          value={settings.conclusionStyle}
          onChange={(v) => onChange({ ...settings, conclusionStyle: v as ArticleTypeSettings["conclusionStyle"] })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        SEO keywords are set when creating each Article, not here — writing style stays separate from
        the specific keywords a given Article targets.
      </p>
    </div>
  );
}
