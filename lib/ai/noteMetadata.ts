import "server-only";
import { guardedGenerateText } from "@/lib/ai/guarded";
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
 * is never lost. This includes a trial account with an exhausted provider-
 * cost budget — that must degrade to the fallback title, never block note
 * creation, which is why the catch block below stays unconditional.
 *
 * This call is NOT counted as a user-facing AI Action (see
 * lib/entitlements/usage.ts — automatic per-note metadata generation would
 * be a confusing thing to charge against a visible "AI Actions" counter),
 * but per the product spec its real provider cost still counts against the
 * (invisible) provider-cost budget — guardedGenerateText handles exactly
 * that split.
 */
export async function generateNoteMetadata(content: string): Promise<NoteMetadataResult> {
  try {
    const { system, prompt } = buildNoteMetadataPrompt(content);
    const { text } = await guardedGenerateText("note_metadata", { system, prompt, temperature: 0.4 });
    return parseNoteMetadataResponse(text);
  } catch (err) {
    console.error("Note metadata generation failed, using fallback:", err);
    return { title: fallbackTitle(), description: "" };
  }
}
