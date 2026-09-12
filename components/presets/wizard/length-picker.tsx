"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/presets/wizard/segmented-choice";
import type { LengthSettings } from "@/lib/writing-engine/presetSettings";
import type { DocumentType } from "@/types";

const QUICK_LABELS: Record<DocumentType, { short: string; medium: string; long: string }> = {
  linkedin_post: { short: "Short", medium: "Medium", long: "Long" },
  article: { short: "Short", medium: "Medium", long: "Long" },
  newsletter: { short: "Short", medium: "Medium", long: "Long" },
  youtube_script: { short: "Short", medium: "Medium", long: "Long" },
  summary: { short: "Brief", medium: "Balanced", long: "Detailed" },
};

const UNIT_LABEL: Record<LengthSettings["unit"], string> = {
  characters: "characters",
  words: "words",
  minutes: "minutes",
};

export function LengthPicker({
  documentType,
  length,
  onChange,
}: {
  documentType: DocumentType;
  length: LengthSettings;
  onChange: (next: LengthSettings) => void;
}) {
  const labels = QUICK_LABELS[documentType];
  const isYoutube = documentType === "youtube_script";

  if (isYoutube) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="length-min" className="text-xs text-muted-foreground">
            Min minutes
          </Label>
          <Input
            id="length-min"
            type="number"
            min={1}
            max={180}
            value={length.min ?? ""}
            onChange={(e) => onChange({ ...length, mode: "custom", min: Number(e.target.value) || undefined })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="length-max" className="text-xs text-muted-foreground">
            Max minutes
          </Label>
          <Input
            id="length-max"
            type="number"
            min={1}
            max={180}
            value={length.max ?? ""}
            onChange={(e) => onChange({ ...length, mode: "custom", max: Number(e.target.value) || undefined })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedChoice
        options={[
          { value: "short", label: labels.short },
          { value: "medium", label: labels.medium },
          { value: "long", label: labels.long },
          ...(documentType === "summary" ? [] : [{ value: "custom", label: "Custom" }]),
        ]}
        value={length.mode}
        onChange={(mode) => onChange({ ...length, mode: mode as LengthSettings["mode"] })}
      />

      {length.mode === "custom" ? (
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="length-min" className="text-xs text-muted-foreground">
              Min {UNIT_LABEL[length.unit]}
            </Label>
            <Input
              id="length-min"
              type="number"
              min={1}
              value={length.min ?? ""}
              onChange={(e) => onChange({ ...length, min: Number(e.target.value) || undefined })}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="length-max" className="text-xs text-muted-foreground">
              Max {UNIT_LABEL[length.unit]}
            </Label>
            <Input
              id="length-max"
              type="number"
              min={1}
              value={length.max ?? ""}
              onChange={(e) => onChange({ ...length, max: Number(e.target.value) || undefined })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
