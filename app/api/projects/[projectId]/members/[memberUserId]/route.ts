import { NextResponse } from "next/server";
import { removeProjectMember } from "@/lib/db/collaboration";
import { uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string; memberUserId: string }>;
}

/**
 * Removes a Member (Owner-only — enforced inside remove_project_member()).
 * Content the Member created (Notes, Documents) is NEVER deleted — only
 * their access is revoked, immediately (the next request from that user
 * against this Project's RLS-protected resources will simply see nothing).
 */
export const DELETE = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const { projectId, memberUserId } = await params;
  uuidSchema.parse(projectId);
  uuidSchema.parse(memberUserId);

  await removeProjectMember(projectId, memberUserId);
  return NextResponse.json({ ok: true });
});
