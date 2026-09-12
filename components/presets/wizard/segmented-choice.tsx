"use client";

import { cn } from "cn";
import type { ChoiceOption } from "@/components/presets/wizard/choice-chip-group";

export function SegmentedChoice({
  options,
  value,
  onChange,
}: {
  options: ChoiceOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="inline-flex w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1 sm:w-fit">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
