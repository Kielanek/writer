import "server-only";
import { toFile } from "openai";
import { getOpenAIClient } from "@/lib/ai/client";
import { env } from "@/lib/env";

export class TranscriptionError extends Error {}

/**
 * Extension -> MIME map for the formats Whisper accepts, used instead of
 * the browser-reported `file.type` when building the upload (some browsers
 * report an empty or non-standard type for a file picked via
 * <input type="file">, e.g. "audio/x-m4a" rather than "audio/mp4").
 * Confirmed NOT the cause of "Invalid file format" errors in practice —
 * that turned out to be specific source files whose actual encoding
 * Whisper can't parse (fixed by re-exporting/converting the file, e.g. to
 * mp3) — but this is still correct, low-risk hygiene to keep.
 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  mpga: "audio/mpeg",
};

function resolveUploadMimeType(filename: string, fallback: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  return (extension && EXTENSION_MIME_TYPES[extension]) || fallback || "application/octet-stream";
}

export interface TranscriptionResult {
  text: string;
  /**
   * Whisper's own measurement of the audio's length — the source of truth
   * for transcription usage accounting (see lib/entitlements/usage.ts).
   * Deliberately NOT the client-supplied `durationSeconds` used elsewhere
   * for display (recorded-note duration): usage must never be based on a
   * value the browser could misreport or fake, and this also works
   * uniformly for uploaded files, which have no client-measured duration
   * at all.
   */
  durationSeconds: number;
}

/**
 * Transcribes an in-memory audio file and returns plain text plus the
 * audio's duration. The caller is responsible for discarding the audio
 * afterward — this function never persists it anywhere.
 */
export async function transcribeAudio(file: File): Promise<TranscriptionResult> {
  const client = getOpenAIClient();
  const filename = file.name || "audio";

  try {
    // Re-wrapped via toFile() with an explicit filename AND a MIME type
    // resolved from that filename's extension (see EXTENSION_MIME_TYPES) —
    // never the browser-reported file.type, which can be empty or
    // non-standard for a file picked via <input type="file">.
    const resolvedType = resolveUploadMimeType(filename, file.type);
    const uploadable = await toFile(file, filename, { type: resolvedType });

    // verbose_json (rather than the default json) is the only response
    // format that reports the audio's duration — needed for transcription
    // usage accounting, not just the transcript text.
    const result = await client.audio.transcriptions.create({
      file: uploadable,
      model: env.openaiTranscriptionModel(),
      response_format: "verbose_json",
    });

    const text = result.text?.trim();
    if (!text) {
      throw new TranscriptionError("Transcription returned no text.");
    }
    return { text, durationSeconds: result.duration ?? 0 };
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    console.error(
      `Transcription failed for name="${filename}" browserType="${file.type}" size=${file.size}:`,
      err
    );
    throw new TranscriptionError(
      "Could not transcribe the audio. Please try again."
    );
  }
}
