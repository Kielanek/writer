import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db/projects";
import { createNote } from "@/lib/db/notes";
import { transcribeAudio, TranscriptionError } from "@/lib/ai/transcribeAudio";
import { generateNoteMetadata } from "@/lib/ai/noteMetadata";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_FILE_BYTES,
  transcriptionRequestSchema,
} from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

/**
 * Accepts an in-memory audio file, transcribes it, generates note metadata,
 * and saves the resulting Note. The audio itself is never written to disk
 * or any storage bucket — it exists only for the duration of this request
 * and is discarded once transcription completes (or fails).
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const formData = await request.formData();

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    throw new ApiError(400, "No audio file was provided.");
  }

  const input = transcriptionRequestSchema.parse({
    projectId: formData.get("projectId"),
    noteType: formData.get("noteType"),
    durationSeconds: formData.get("durationSeconds") ?? undefined,
  });

  if (audio.size === 0) {
    throw new ApiError(400, "The audio file is empty.");
  }
  if (audio.size > MAX_AUDIO_FILE_BYTES) {
    throw new ApiError(400, "The audio file is too large. Maximum size is 25 MB.");
  }
  // Recorded audio often carries codec parameters (e.g. "audio/webm;codecs=opus"),
  // so compare only the base MIME type against the allowlist.
  const baseAudioType = audio.type.split(";")[0].trim().toLowerCase();
  if (baseAudioType && !ALLOWED_AUDIO_MIME_TYPES.has(baseAudioType)) {
    throw new ApiError(
      400,
      `Unsupported audio type: ${audio.type}. Try mp3, m4a, wav, or webm.`
    );
  }

  const project = await getProject(input.projectId);
  if (!project) throw new ApiError(404, "Project not found.");

  let transcript: string;
  try {
    transcript = await transcribeAudio(audio);
  } catch (err) {
    if (err instanceof TranscriptionError) {
      throw new ApiError(422, err.message);
    }
    throw err;
  }

  const metadata = await generateNoteMetadata(transcript);

  const note = await createNote({
    projectId: input.projectId,
    type: input.noteType,
    title: metadata.title,
    description: metadata.description,
    content: transcript,
    durationSeconds: input.durationSeconds ?? null,
  });

  return NextResponse.json({ note }, { status: 201 });
});
