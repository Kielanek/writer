"use client";

import { cn } from "cn";

export interface ChoiceOption {
  value: string;
  label: string;
}

export function ChoiceChipGroup({
  options,
  selected,
  onChange,
  max,
}: {
  options: ChoiceOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
      return;
    }
    if (max != null && selected.length >= max) return;
    onChange([...selected, value]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.value);
        const disabled = !active && max != null && selected.length >= max;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => toggle(option.value)}
            className={cn(
              "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:border-foreground/40",
              disabled && "opacity-40"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
