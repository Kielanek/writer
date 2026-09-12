import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { env } from "@/lib/env";

export class TranscriptionError extends Error {}

/**
 * Transcribes an in-memory audio file and returns plain text.
 * The caller is responsible for discarding the audio afterward —
 * this function never persists it anywhere.
 */
export async function transcribeAudio(file: File): Promise<string> {
  const client = getOpenAIClient();

  try {
    const result = await client.audio.transcriptions.create({
      file,
      model: env.openaiTranscriptionModel(),
    });

    const text = result.text?.trim();
    if (!text) {
      throw new TranscriptionError("Transcription returned no text.");
    }
    return text;
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError(
      "Could not transcribe the audio. Please try again."
    );
  }
}
