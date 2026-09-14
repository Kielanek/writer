import { NextResponse } from "next/server";
import { acceptProjectInvitation } from "@/lib/db/collaboration";
import { uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ invitationId: string }>;
}

/**
 * Accepts a pending invitation — accept_project_invitation() verifies the
 * invitation belongs to the CALLER's own verified session email (never a
 * client-supplied identity), is still pending and unexpired, then creates
 * the project_members row atomically.
 */
export const POST = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const { invitationId } = await params;
  uuidSchema.parse(invitationId);

  const member = await acceptProjectInvitation(invitationId);
  return NextResponse.json({ member });
});
