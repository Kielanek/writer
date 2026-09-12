import type { BuiltInPreset } from "../types";

export const ARTICLE_PRESETS: BuiltInPreset[] = [
  {
    id: "article-expert",
    documentType: "article",
    label: "Expert Article",
    description: "An authoritative, well-reasoned piece that demonstrates real expertise.",
    rules: [
      "Write with the authority of someone who has direct experience with the subject.",
      "Support claims with specific reasoning or examples from the notes.",
      "Build a clear line of argument from introduction to conclusion.",
    ],
    avoidRules: [
      "Avoid generic textbook-style explanations with no point of view.",
      "Avoid hedging that undercuts the article's authority.",
    ],
    version: 1,
    isDefault: true,
  },
  {
    id: "article-how-to",
    documentType: "article",
    label: "How-To Guide",
    description: "A practical, step-oriented guide the reader can follow to get a result.",
    rules: [
      "Make the end result clear early: what the reader will be able to do.",
      "Order the content the way someone would actually execute the steps.",
      "Be specific and concrete rather than abstract.",
    ],
    avoidRules: [
      "Avoid vague steps like \"do more research\" with no actionable detail.",
      "Avoid skipping steps that are obvious to the author but not the reader.",
    ],
    version: 1,
  },
  {
    id: "article-opinion",
    documentType: "article",
    label: "Opinion Piece",
    description: "A persuasive, personal take on a topic, argued from a clear position.",
    rules: [
      "State the position clearly and early.",
      "Argue it with conviction, using specific reasoning from the notes.",
      "Address the strongest counterargument rather than ignoring it.",
    ],
    avoidRules: [
      "Avoid false balance. This is an opinion piece, not a neutral overview.",
      "Avoid unsupported sweeping claims.",
    ],
    version: 1,
  },
  {
    id: "article-case-study",
    documentType: "article",
    label: "Case Study",
    description: "A structured account of a specific situation, what happened, and what it shows.",
    rules: [
      "Ground the piece in the specific situation described in the notes: names, numbers, timeline where available.",
      "Walk through context, what was done, and the outcome, in that order.",
      "Draw a clear, honest conclusion from what actually happened.",
    ],
    avoidRules: [
      "Avoid inventing results, metrics, or outcomes not present in the notes.",
      "Avoid generic \"lessons learned\" that aren't tied to the specific case.",
    ],
    version: 1,
  },
];
