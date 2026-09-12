"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { DocumentType } from "@/types";
import type { WizardState } from "@/components/presets/wizard/wizard-types";

export function StepBasics({
  documentType,
  state,
  onChange,
}: {
  documentType: DocumentType;
  state: WizardState;
  onChange: (next: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
        {DOCUMENT_TYPE_LABELS[documentType]}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wizard-name">Preset Name</Label>
        <Input
          id="wizard-name"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="My Expert LinkedIn"
          maxLength={120}
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wizard-description">Description</Label>
        <span className="text-xs text-muted-foreground">Optional. A short note for yourself.</span>
        <Textarea
          id="wizard-description"
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What is this preset for?"
          rows={2}
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wizard-purpose">Purpose</Label>
        <span className="text-xs text-muted-foreground">
          Optional, but helps the AI a lot. What should this preset be used to write?
        </span>
        <Textarea
          id="wizard-purpose"
          value={state.settings.purpose ?? ""}
          onChange={(e) => onChange({ settings: { ...state.settings, purpose: e.target.value } })}
          placeholder="Share practical opinions and observations about Etsy and online business."
          rows={2}
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wizard-audience">Audience</Label>
        <span className="text-xs text-muted-foreground">Optional. Who is this for?</span>
        <Textarea
          id="wizard-audience"
          value={state.settings.audience ?? ""}
          onChange={(e) => onChange({ settings: { ...state.settings, audience: e.target.value } })}
          placeholder="Beginner and intermediate online sellers."
          rows={2}
          maxLength={300}
        />
      </div>
    </div>
  );
}
