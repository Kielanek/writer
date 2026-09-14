import { NextRequest, NextResponse } from "next/server";
import { createDocumentVersion, getDocument } from "@/lib/db/documents";
import { buildProjectContext, ProjectContextError, ProjectNotFoundError } from "@/lib/context/buildProjectContext";
import { generateDocumentEdit, AiGenerationError } from "@/lib/ai/documentGeneration";
import { resolveDocumentPresetSnapshot } from "@/lib/writing-engine/snapshot";
import { resolveDocumentSeoConfig } from "@/lib/writing-engine/seoKeywords";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { aiEditDocumentSchema, uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";
import { env } from "@/lib/env";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

/**
 * Applies an AI edit to a Document: sends full Project context + current
 * content + the user's instruction, replaces the working content with the
 * model's full revised version, and records a new version (source = ai_edit).
 */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const actor = await requireUser();
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const body = await request.json();
  const input = aiEditDocumentSchema.parse(body);

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");

  // Preserve the preset the Document was originally generated with — AI
  // editing must never fall back to a generic writing style. Falls back to
  // the default built-in preset only for pre-Writing-Engine Documents that
  // have no snapshot at all.
  const presetSnapshot = resolveDocumentPresetSnapshot(document);
  const seoKeywords = resolveDocumentSeoConfig(document);

  let context;
  try {
    context = await buildProjectContext(document.project_id);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) throw new ApiError(404, err.message);
    if (err instanceof ProjectContextError) throw new ApiError(422, err.message);
    throw err;
  }

  const billing = { billingUserId: context.project.owner_id, actorUserId: actor.id, projectId: document.project_id };

  await checkAiActionLimit(billing.billingUserId);

  let revisedContent: string;
  try {
    revisedContent = await generateDocumentEdit({
      context,
      documentType: document.type,
      currentContent: document.content,
      creationInstructions: document.creation_instructions,
      editInstruction: input.instruction,
      presetSnapshot,
      seoKeywords,
      billing,
    });
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }

  await recordUsageEvent({
    eventType: "ai_action",
    quantity: 1,
    metadata: { feature: "document_edit", model: env.openaiTextModel(), documentType: document.type },
    billingUserId: billing.billingUserId,
    actorUserId: billing.actorUserId,
    projectId: billing.projectId,
  });

  const version = await createDocumentVersion({
    documentId,
    content: revisedContent,
    source: "ai_edit",
    instruction: input.instruction,
    seoSettings: document.seo_settings,
  });

  return NextResponse.json({ version }, { status: 201 });
});
