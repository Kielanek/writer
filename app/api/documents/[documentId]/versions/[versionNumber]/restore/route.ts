import { NextRequest, NextResponse } from "next/server";
import { createDocumentVersion, getDocument, getDocumentVersion } from "@/lib/db/documents";
import { uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ documentId: string; versionNumber: string }>;
}

/**
 * Restores an older version WITHOUT destroying history: creates a brand-new
 * version (source = restore) carrying the old content, rather than deleting
 * anything newer.
 */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { documentId, versionNumber } = await params;
  uuidSchema.parse(documentId);

  const versionNum = Number(versionNumber);
  if (!Number.isInteger(versionNum) || versionNum <= 0) {
    throw new ApiError(400, "Invalid version number.");
  }

  const document = await getDocument(documentId);
  if (!document) throw new ApiError(404, "Document not found.");

  const targetVersion = await getDocumentVersion(documentId, versionNum);
  if (!targetVersion) throw new ApiError(404, "Version not found.");

  const version = await createDocumentVersion({
    documentId,
    content: targetVersion.content,
    source: "restore",
    restoredFromVersion: versionNum,
  });

  return NextResponse.json({ version }, { status: 201 });
});
