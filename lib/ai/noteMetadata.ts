import "server-only";
import { generateText } from "@/lib/ai/generateText";
import { buildNoteMetadataPrompt, parseNoteMetadataResponse } from "@/lib/ai/prompts/noteMetadata";

export interface NoteMetadataResult {
  title: string;
  description: string;
}

function fallbackTitle(): string {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Voice Note – ${date}`;
}

/**
 * Generates a title + short description for a note's content. Never throws:
 * if generation fails, returns a safe fallback so the note's transcription
 * is never lost.
 */
export async function generateNoteMetadata(content: string): Promise<NoteMetadataResult> {
  try {
    const { system, prompt } = buildNoteMetadataPrompt(content);
    const raw = await generateText({ system, prompt, temperature: 0.4 });
    return parseNoteMetadataResponse(raw);
  } catch (err) {
    console.error("Note metadata generation failed, using fallback:", err);
    return { title: fallbackTitle(), description: "" };
  }
}
