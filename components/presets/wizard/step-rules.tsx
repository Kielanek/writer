"use client";

import { RuleListEditor } from "@/components/presets/rule-list-editor";
import { SuggestedRules } from "@/components/presets/wizard/suggested-rules";
import { getSuggestedRules, getSuggestedAvoidRules } from "@/lib/writing-engine/suggestedRules";
import type { DocumentType } from "@/types";
import type { WizardState } from "@/components/presets/wizard/wizard-types";

export function StepRules({
  documentType,
  state,
  onChange,
}: {
  documentType: DocumentType;
  state: WizardState;
  onChange: (next: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <RuleListEditor
          label="Always do"
          rules={state.rules}
          onChange={(rules) => onChange({ rules })}
          placeholder="e.g. Use concrete examples from my notes."
        />
        <SuggestedRules
          suggestions={getSuggestedRules(documentType)}
          current={state.rules}
          onAdd={(rule) => onChange({ rules: [...state.rules.filter((r) => r.trim()), rule] })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <RuleListEditor
          label="Never do"
          rules={state.avoidRules}
          onChange={(avoidRules) => onChange({ avoidRules })}
          placeholder="e.g. Never invent personal experiences."
        />
        <SuggestedRules
          suggestions={getSuggestedAvoidRules(documentType)}
          current={state.avoidRules}
          onAdd={(rule) => onChange({ avoidRules: [...state.avoidRules.filter((r) => r.trim()), rule] })}
        />
      </div>
    </div>
  );
}
