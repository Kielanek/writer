import { NextRequest, NextResponse } from "next/server";
import { createDocument, createDocumentVersion } from "@/lib/db/documents";
import { buildProjectContext, ProjectContextError, ProjectNotFoundError } from "@/lib/context/buildProjectContext";
import { generateDocumentContent, AiGenerationError } from "@/lib/ai/documentGeneration";
import { resolvePreset } from "@/lib/writing-engine/customPresets/service";
import { buildPresetSnapshot } from "@/lib/writing-engine/snapshot";
import { WRITING_ENGINE_VERSION } from "@/lib/writing-engine/version";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { createDocumentSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { env } from "@/lib/env";

/** Generates a brand-new Document from the Project's Notes and creates its v1 (initial) version. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const input = createDocumentSchema.parse(body);

  const preset = await resolvePreset(input.type, input.presetId);
  if (!preset) throw new ApiError(400, "Selected writing preset was not found.");
  const presetSnapshot = buildPresetSnapshot(preset);

  let context;
  try {
    context = await buildProjectContext(input.projectId);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) throw new ApiError(404, err.message);
    if (err instanceof ProjectContextError) throw new ApiError(422, err.message);
    throw err;
  }

  await checkAiActionLimit();

  let content: string;
  try {
    content = await generateDocumentContent({
      context,
      documentType: input.type,
      instructions: input.instructions,
      presetSnapshot,
      seoKeywords: input.seoSettings ?? null,
    });
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }

  await recordUsageEvent({
    eventType: "ai_action",
    quantity: 1,
    metadata: { feature: "document_generation", model: env.openaiTextModel(), documentType: input.type },
  });

  const document = await createDocument({
    projectId: input.projectId,
    type: input.type,
    title: DOCUMENT_TYPE_LABELS[input.type],
    creationInstructions: input.instructions,
    content,
    presetId: preset.id,
    presetSnapshot,
    writingEngineVersion: WRITING_ENGINE_VERSION,
    seoSettings: input.seoSettings ?? null,
  });

  await createDocumentVersion({
    documentId: document.id,
    content,
    source: "initial",
  });

  return NextResponse.json({ document }, { status: 201 });
});
