import type { BuiltInPreset } from "../types";

export const LINKEDIN_PRESETS: BuiltInPreset[] = [
  {
    id: "linkedin-thought-leadership",
    documentType: "linkedin_post",
    label: "Thought Leadership",
    description: "A confident, opinionated take that positions the author as someone worth listening to.",
    rules: [
      "Lead with a clear point of view, not a neutral observation.",
      "Back the opinion with specific reasoning or evidence from the notes.",
      "Write with quiet confidence rather than hype.",
    ],
    avoidRules: [
      "Avoid hedging every sentence with qualifiers like \"I think\" or \"maybe.\"",
      "Avoid vague inspirational statements with no real point.",
    ],
    version: 1,
    isDefault: true,
  },
  {
    id: "linkedin-storytelling",
    documentType: "linkedin_post",
    label: "Storytelling",
    description: "A short narrative (a specific moment or experience) that leads to a takeaway.",
    rules: [
      "Open with a concrete moment or scene, not an abstract statement.",
      "Let the story carry the point instead of stating the lesson up front.",
      "Land on a clear, earned takeaway at the end.",
    ],
    avoidRules: [
      "Avoid inventing story details that are not present in the notes.",
      "Avoid a moral-of-the-story tone that feels preachy.",
    ],
    version: 1,
  },
  {
    id: "linkedin-educational",
    documentType: "linkedin_post",
    label: "Educational",
    description: "A practical, teach-something post the reader can act on.",
    rules: [
      "Make the practical takeaway obvious within the first few lines.",
      "Prefer concrete, specific advice over generic best practices.",
      "Ground each point in something from the Project Notes when possible.",
    ],
    avoidRules: [
      "Avoid padding with obvious statements the reader already knows.",
      "Avoid turning it into a listicle with no connective narrative.",
    ],
    version: 1,
  },
  {
    id: "linkedin-contrarian",
    documentType: "linkedin_post",
    label: "Contrarian",
    description: "Challenges a common assumption in the space, backed by real reasoning.",
    rules: [
      "State the common belief being challenged clearly before disagreeing with it.",
      "Support the contrarian take with specific reasoning, not just provocation.",
      "Stay credible. The disagreement should feel earned, not edgy for its own sake.",
    ],
    avoidRules: [
      "Avoid strawmanning the opposing view.",
      "Avoid contrarianism that isn't actually supported by the notes.",
    ],
    version: 1,
  },
  {
    id: "linkedin-short-insight",
    documentType: "linkedin_post",
    label: "Short Insight",
    description: "A brief, high-density post built around a single sharp observation.",
    rules: [
      "Keep it short: one idea, stated tightly, with no filler.",
      "Make every sentence earn its place.",
    ],
    avoidRules: [
      "Avoid stretching a short idea into unnecessary length.",
      "Avoid adding a second, unrelated point just to fill space.",
    ],
    version: 1,
  },
];
