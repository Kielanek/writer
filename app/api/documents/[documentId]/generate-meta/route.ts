import { NextRequest, NextResponse } from "next/server";
import { getDocument, updateDocumentContent } from "@/lib/db/documents";
import { getProject } from "@/lib/db/projects";
import { generateDocumentMeta, AiGenerationError } from "@/lib/ai/documentGeneration";
import { resolveDocumentSeoConfig } from "@/lib/writing-engine/seoKeywords";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";
import { env } from "@/lib/env";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

/**
 * (Re)generates JUST the SEO meta title/description for an Article, from its
 * own current title/content — never the Article body. Merges the result
 * into the existing seo_settings object (preserving primaryKeyword/
 * secondaryKeywords) via updateDocumentContent, the same autosave-only path
 * the manual editor uses — this does NOT create a Document Version; the
 * next real content-driven version (Save Version/AI Edit/restore) is what
 * snapshots whatever seo_settings is current at that time.
 *
 * Counts as an AI Action, same as Generate Document/AI Edit/Ask Project/
 * Analyze Examples, since it's a deliberate, user-triggered OpenAI call —
 * billed to the Project Owner regardless of whether the actor is the Owner
 * or a Member. Overwrite confirmation (if the user already has
 * manually-set values) happens client-side before this is ever called —
 * this endpoint always just does what's asked.
 */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const actor = await requireUser();
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");
  if (document.type !== "article") {
    throw new ApiError(400, "SEO meta generation is only available for Article documents.");
  }
  if (!document.content.trim()) {
    throw new ApiError(422, "Write some content before generating SEO meta tags.");
  }

  const seoKeywords = resolveDocumentSeoConfig(document);
  if (!seoKeywords) {
    throw new ApiError(422, "Add a primary keyword before generating SEO meta tags.");
  }

  const project = await getProject(document.project_id);
  if (!project) throw new ApiError(404, "Project not found.");
  const billing = { billingUserId: project.owner_id, actorUserId: actor.id, projectId: project.id };

  await checkAiActionLimit(billing.billingUserId);

  let meta;
  try {
    meta = await generateDocumentMeta({
      title: document.title,
      content: document.content,
      primaryKeyword: seoKeywords.primaryKeyword,
      billing,
    });
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw new ApiError(502, "Failed to generate SEO meta tags.");
  }

  await recordUsageEvent({
    eventType: "ai_action",
    quantity: 1,
    metadata: { feature: "document_meta", model: env.openaiTextModel(), documentType: document.type },
    billingUserId: billing.billingUserId,
    actorUserId: billing.actorUserId,
    projectId: billing.projectId,
  });

  const updated = await updateDocumentContent(documentId, {
    seoSettings: { ...seoKeywords, ...meta },
  });

  return NextResponse.json({ document: updated });
});
