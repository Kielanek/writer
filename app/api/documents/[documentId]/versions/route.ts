import { NextRequest, NextResponse } from "next/server";
import { createDocumentVersion, getDocument, listDocumentVersions } from "@/lib/db/documents";
import { saveVersionSchema, uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");

  const versions = await listDocumentVersions(documentId);
  return NextResponse.json({ versions });
});

/** Manual "Save Version" checkpoint — creates a version with source = manual. */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { documentId } = await params;
  uuidSchema.parse(documentId);

  const body = await request.json().catch(() => ({}));
  const input = saveVersionSchema.parse(body);

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");

  const content = input.content ?? document.content;
  const seoSettings = input.seoSettings ?? document.seo_settings;

  const version = await createDocumentVersion({
    documentId,
    content,
    source: "manual",
    seoSettings,
  });

  return NextResponse.json({ version }, { status: 201 });
});
