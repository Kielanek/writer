import "server-only";
import { toFile } from "openai";
import { getOpenAIClient } from "@/lib/ai/client";
import { env } from "@/lib/env";

export class TranscriptionError extends Error {}

/**
 * Extension -> MIME map for the formats Whisper accepts. The browser's own
 * `file.type` for a file picked via <input type="file"> is unreliable —
 * Windows in particular has no registered MIME type for `.m4a`, so
 * `file.type` comes through as an empty string. Sending that empty/wrong
 * type upstream breaks the multipart part's Content-Type and Whisper
 * rejects the file as "Invalid file format" even though the bytes are
 * perfectly valid audio. Deriving the type from the filename extension
 * instead sidesteps the browser entirely.
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

/**
 * Transcribes an in-memory audio file and returns plain text.
 * The caller is responsible for discarding the audio afterward —
 * this function never persists it anywhere.
 */
export async function transcribeAudio(file: File): Promise<string> {
  const client = getOpenAIClient();

  try {
    // Re-wrapped via toFile() with an explicit filename AND a MIME type
    // resolved from that filename's extension (see EXTENSION_MIME_TYPES) —
    // never the browser-reported file.type, which is empty for .m4a on
    // Windows and would otherwise silently corrupt the upload's Content-Type.
    const filename = file.name || "audio";
    const resolvedType = resolveUploadMimeType(filename, file.type);
    console.log(
      `Transcription upload: name="${filename}" browserType="${file.type}" resolvedType="${resolvedType}" size=${file.size}`
    );
    const uploadable = await toFile(file, filename, { type: resolvedType });

    const result = await client.audio.transcriptions.create({
      file: uploadable,
      model: env.openaiTranscriptionModel(),
    });

    const text = result.text?.trim();
    if (!text) {
      throw new TranscriptionError("Transcription returned no text.");
    }
    return text;
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    console.error("Transcription failed:", err);
    throw new TranscriptionError(
      "Could not transcribe the audio. Please try again."
    );
  }
}
