import type { BuiltInPreset } from "../types";

export const NEWSLETTER_PRESETS: BuiltInPreset[] = [
  {
    id: "newsletter-personal-letter",
    documentType: "newsletter",
    label: "Personal Letter",
    description: "Reads like a genuine personal update from the author, not a broadcast.",
    rules: [
      "Write in a warm, first-person voice, as if writing to one specific reader.",
      "Share something real from the notes rather than a generic update.",
    ],
    avoidRules: [
      "Avoid corporate or marketing-style phrasing.",
      "Avoid a formal, distant tone.",
    ],
    version: 1,
  },
  {
    id: "newsletter-educational",
    documentType: "newsletter",
    label: "Educational",
    description: "Teaches the reader something useful in a friendly, email-native way.",
    rules: [
      "Lead with the practical value the reader gets from this issue.",
      "Keep explanations concrete and grounded in the notes.",
    ],
    avoidRules: [
      "Avoid turning the email into a dense textbook chapter.",
    ],
    version: 1,
    isDefault: true,
  },
  {
    id: "newsletter-story-lesson",
    documentType: "newsletter",
    label: "Story + Lesson",
    description: "A short story from the notes that leads into a practical takeaway.",
    rules: [
      "Open with the story, then transition naturally into what it taught.",
      "Keep the lesson specific and tied directly to the story, not generic advice.",
    ],
    avoidRules: [
      "Avoid inventing story details not present in the notes.",
      "Avoid a heavy-handed \"and the moral is\" transition.",
    ],
    version: 1,
  },
  {
    id: "newsletter-opinion",
    documentType: "newsletter",
    label: "Opinion",
    description: "A direct, personal take the reader wouldn't get from a press release.",
    rules: [
      "State the opinion plainly and early.",
      "Back it with specific reasoning from the notes.",
    ],
    avoidRules: [
      "Avoid softening the opinion into a non-statement.",
    ],
    version: 1,
  },
];
