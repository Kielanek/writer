export interface NoteMetadataPrompt {
  system: string;
  prompt: string;
}

/** Builds the prompt used to derive a title + short description from note content. */
export function buildNoteMetadataPrompt(content: string): NoteMetadataPrompt {
  return {
    system: [
      "You generate concise metadata for a personal note inside a content creator's workspace.",
      "Given the note's content, produce a short title and a one-sentence description.",
      "Respond in the same language as the note content.",
      "Respond ONLY with valid JSON in this exact shape, no markdown fences:",
      '{"title": string, "description": string}',
      "The title must be under 60 characters. The description must be under 160 characters.",
      "Do not invent information that is not present in the content.",
    ].join("\n"),
    prompt: `Note content:\n"""\n${content}\n"""`,
  };
}

export interface ParsedNoteMetadata {
  title: string;
  description: string;
}

/** Parses the model's JSON response, tolerating minor formatting noise. */
export function parseNoteMetadataResponse(raw: string): ParsedNoteMetadata {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("Malformed metadata response");
  }
  return {
    title: parsed.title.trim().slice(0, 200),
    description: parsed.description.trim().slice(0, 500),
  };
}
