import { NextResponse } from "next/server";
import { revokeProjectInvitation } from "@/lib/db/collaboration";
import { uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string; invitationId: string }>;
}

/** Revokes a pending invitation (Owner-only — enforced inside revoke_project_invitation()) and frees the seat it was reserving. */
export const DELETE = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const { invitationId } = await params;
  uuidSchema.parse(invitationId);

  await revokeProjectInvitation(invitationId);
  return NextResponse.json({ ok: true });
});
