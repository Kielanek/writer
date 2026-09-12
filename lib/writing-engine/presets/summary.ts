import type { BuiltInPreset } from "../types";

export const SUMMARY_PRESETS: BuiltInPreset[] = [
  {
    id: "summary-executive",
    documentType: "summary",
    label: "Executive Summary",
    description: "A tight, high-level overview for someone who needs the gist fast.",
    rules: [
      "Lead with the single most important takeaway.",
      "Keep it brief. Assume the reader has limited time.",
      "Favor clarity and structure over completeness.",
    ],
    avoidRules: [
      "Avoid including minor details that don't change the big picture.",
    ],
    version: 1,
    isDefault: true,
  },
  {
    id: "summary-ideas-insights",
    documentType: "summary",
    label: "Ideas & Insights",
    description: "Captures the most interesting ideas and insights, not just a compressed recap.",
    rules: [
      "Highlight the ideas that are most distinctive or non-obvious, not just the most-repeated ones.",
      "Group related insights together rather than listing them in note order.",
    ],
    avoidRules: [
      "Avoid a flat, mechanical recap that treats every point as equally important.",
    ],
    version: 1,
  },
];
