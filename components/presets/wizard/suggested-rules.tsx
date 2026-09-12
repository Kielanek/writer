"use client";

import { Plus } from "lucide-react";

export function SuggestedRules({
  suggestions,
  current,
  onAdd,
}: {
  suggestions: string[];
  current: string[];
  onAdd: (rule: string) => void;
}) {
  const available = suggestions.filter((s) => !current.includes(s));
  if (available.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Suggested</span>
      <div className="flex flex-wrap gap-1.5">
        {available.map((rule) => (
          <button
            key={rule}
            type="button"
            onClick={() => onAdd(rule)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Plus className="size-3" />
            {rule}
          </button>
        ))}
      </div>
    </div>
  );
}
