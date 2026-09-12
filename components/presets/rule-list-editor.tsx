"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RuleListEditor({
  label,
  rules,
  onChange,
  placeholder,
}: {
  label: string;
  rules: string[];
  onChange: (rules: string[]) => void;
  placeholder: string;
}) {
  function updateRule(index: number, value: string) {
    onChange(rules.map((r, i) => (i === index ? value : r)));
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  function addRule() {
    onChange([...rules, ""]);
  }

  function moveRule(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-1">
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-label="Move rule up"
                disabled={index === 0}
                onClick={() => moveRule(index, -1)}
                className="flex size-5 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move rule down"
                disabled={index === rules.length - 1}
                onClick={() => moveRule(index, 1)}
                className="flex size-5 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
            <Input
              value={rule}
              onChange={(e) => updateRule(index, e.target.value)}
              placeholder={placeholder}
              maxLength={300}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              onClick={() => removeRule(index)}
              aria-label="Remove rule"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRule}>
        <Plus className="size-4" />
        Add rule
      </Button>
    </div>
  );
}
