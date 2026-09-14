import { NextRequest, NextResponse } from "next/server";
import { createDocument, createDocumentVersion } from "@/lib/db/documents";
import { buildProjectContext, ProjectContextError, ProjectNotFoundError } from "@/lib/context/buildProjectContext";
import { generateDocumentContent, generateDocumentMeta, AiGenerationError } from "@/lib/ai/documentGeneration";
import { resolvePreset } from "@/lib/writing-engine/customPresets/service";
import { buildPresetSnapshot } from "@/lib/writing-engine/snapshot";
import { WRITING_ENGINE_VERSION } from "@/lib/writing-engine/version";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { createDocumentSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { env } from "@/lib/env";

/**
 * Generates a brand-new Document from the Project's Notes and creates its
 * v1 (initial) version. Billed to the Project OWNER (`context.project.owner_id`)
 * regardless of whether the actor is the Owner or a Member — see the
 * collaboration model's "usage is charged to the Owner" rule.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const actor = await requireUser();
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

  const billing = { billingUserId: context.project.owner_id, actorUserId: actor.id, projectId: input.projectId };

  await checkAiActionLimit(billing.billingUserId);

  let content: string;
  try {
    content = await generateDocumentContent({
      context,
      documentType: input.type,
      instructions: input.instructions,
      presetSnapshot,
      seoKeywords: input.seoSettings ?? null,
      billing,
    });
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }

  await recordUsageEvent({
    eventType: "ai_action",
    quantity: 1,
    metadata: { feature: "document_generation", model: env.openaiTextModel(), documentType: input.type },
    billingUserId: billing.billingUserId,
    actorUserId: billing.actorUserId,
    projectId: billing.projectId,
  });

  // Every new Article also gets an initial meta title/description, derived
  // from the content that was just generated — a short, separate call so a
  // failure here never blocks Article creation itself (the user can always
  // generate or fill these in manually afterward from the SEO Meta editor).
  let seoSettings = input.seoSettings ?? null;
  if (input.type === "article" && seoSettings) {
    try {
      const meta = await generateDocumentMeta({
        title: DOCUMENT_TYPE_LABELS[input.type],
        content,
        primaryKeyword: seoSettings.primaryKeyword,
        billing,
      });
      seoSettings = { ...seoSettings, ...meta };
    } catch (err) {
      console.error("Initial SEO meta generation failed; Article was still created.", err);
    }
  }

  const document = await createDocument({
    projectId: input.projectId,
    type: input.type,
    title: DOCUMENT_TYPE_LABELS[input.type],
    creationInstructions: input.instructions,
    content,
    presetId: preset.id,
    presetSnapshot,
    writingEngineVersion: WRITING_ENGINE_VERSION,
    seoSettings,
  });

  await createDocumentVersion({
    documentId: document.id,
    content,
    source: "initial",
    seoSettings,
  });

  return NextResponse.json({ document }, { status: 201 });
});
