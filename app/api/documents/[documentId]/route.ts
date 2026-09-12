import { NextRequest, NextResponse } from "next/server";
import { deleteDocument, getDocument, updateDocumentContent } from "@/lib/db/documents";
import { updateDocumentSchema, uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");

  return NextResponse.json({ document });
});

/** Autosave-only update. Does NOT create a version history entry. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const body = await request.json();
  const input = updateDocumentSchema.parse(body);

  const existing = await getDocument(documentId);
  if (!existing) throw new ApiError(404, "Document not found.");
  if (input.seoSettings && existing.type !== "article") {
    throw new ApiError(400, "SEO keywords can only be set on Article documents.");
  }

  const document = await updateDocumentContent(documentId, input);
  return NextResponse.json({ document });
});

export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const existing = await getDocument(documentId);
  if (!existing) throw new ApiError(404, "Document not found.");

  await deleteDocument(documentId);
  return NextResponse.json({ ok: true });
});
