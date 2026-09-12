import type { BuiltInPreset } from "../types";

export const YOUTUBE_PRESETS: BuiltInPreset[] = [
  {
    id: "youtube-educational",
    documentType: "youtube_script",
    label: "Educational",
    description: "Teaches the viewer something concrete, clearly and efficiently.",
    rules: [
      "State what the viewer will learn within the first 15 seconds.",
      "Explain concepts in the simplest terms that are still accurate.",
      "Use concrete examples from the notes rather than abstract explanations.",
    ],
    avoidRules: [
      "Avoid over-explaining points the audience likely already understands.",
      "Avoid burying the actual teaching under a long preamble.",
    ],
    version: 1,
    isDefault: true,
  },
  {
    id: "youtube-storytelling",
    documentType: "youtube_script",
    label: "Storytelling",
    description: "Carries the video through a personal story or narrative arc.",
    rules: [
      "Open in the middle of the story's most interesting moment, then fill in context.",
      "Let the narrative build naturally toward the point instead of stating it upfront.",
      "Keep the story grounded in what's actually in the notes.",
    ],
    avoidRules: [
      "Avoid inventing story beats not present in the notes.",
      "Avoid a flat, chronological retelling with no tension or shape.",
    ],
    version: 1,
  },
  {
    id: "youtube-list-video",
    documentType: "youtube_script",
    label: "List Video",
    description: "Structured around a countable set of points (e.g. \"5 mistakes\").",
    rules: [
      "Make the list structure clear verbally (\"the first mistake is...\") since there are no visible headings.",
      "Give each item enough depth to be useful, not just a one-liner.",
      "Vary how each item is introduced so the video doesn't feel mechanically repetitive.",
    ],
    avoidRules: [
      "Avoid making every item exactly the same length and shape.",
      "Avoid padding the list with a weak point just to hit a round number.",
    ],
    version: 1,
  },
  {
    id: "youtube-tutorial",
    documentType: "youtube_script",
    label: "Tutorial",
    description: "Walks the viewer through doing something, step by step, on screen.",
    rules: [
      "Order steps the way the viewer will actually perform them.",
      "Call out likely points of confusion or common mistakes as they come up.",
      "Keep instructions concrete enough to follow along in real time.",
    ],
    avoidRules: [
      "Avoid skipping steps that seem obvious to an expert but not a beginner.",
      "Avoid vague instructions like \"just configure it correctly.\"",
    ],
    version: 1,
  },
];
