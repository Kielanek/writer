import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/db/projects";
import { createNote } from "@/lib/db/notes";
import { TranscriptionError } from "@/lib/ai/transcribeAudio";
import { guardedTranscribeAudio } from "@/lib/ai/guarded";
import { generateNoteMetadata } from "@/lib/ai/noteMetadata";
import { checkTranscriptionAllowance, recordUsageEvent } from "@/lib/entitlements/usage";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_FILE_BYTES,
  transcriptionRequestSchema,
} from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";

/**
 * Accepts an in-memory audio file, transcribes it, generates note metadata,
 * and saves the resulting Note. The audio itself is never written to disk
 * or any storage bucket — it exists only for the duration of this request
 * and is discarded once transcription completes (or fails). Any
 * collaborator can transcribe into a shared Project; usage/cost is billed
 * to the Project Owner regardless of who's uploading.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const actor = await requireUser();
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

  const billing = { billingUserId: project.owner_id, actorUserId: actor.id, projectId: project.id };

  // Blocks only if the BILLING user is already at/over their limit — the
  // file's own duration isn't known until Whisper has transcribed it, so
  // this can't reserve the exact amount up front (see
  // checkTranscriptionAllowance()'s doc comment for why that's an accepted
  // MVP limitation rather than a fragile duration estimate).
  await checkTranscriptionAllowance(billing.billingUserId);

  let transcript: string;
  let durationSeconds: number;
  try {
    // guardedTranscribeAudio reserves a conservative provider-cost estimate
    // (from file size — see lib/entitlements/cost.ts) before ever sending
    // the file to OpenAI, and records the REAL cost (from Whisper's own
    // reported duration) as its own provider_cost event on success.
    const result = await guardedTranscribeAudio(audio);
    transcript = result.text;
    durationSeconds = result.durationSeconds;
  } catch (err) {
    if (err instanceof TranscriptionError) {
      throw new ApiError(422, err.message);
    }
    throw err;
  }

  // Recorded from Whisper's own measurement, never the client-supplied
  // durationSeconds (that value is kept only for the note's display field
  // below) — usage accounting must never trust a client-reported quantity.
  // This is the user-facing product counter (transcription minutes); real
  // provider cost was already recorded above.
  if (durationSeconds > 0) {
    await recordUsageEvent({
      eventType: "transcription_seconds",
      quantity: durationSeconds,
      metadata: { feature: "transcription" },
      billingUserId: billing.billingUserId,
      actorUserId: billing.actorUserId,
      projectId: billing.projectId,
    });
  }

  const metadata = await generateNoteMetadata(transcript, billing);

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
