import { NextRequest, NextResponse } from "next/server";
import { inviteProjectMember } from "@/lib/db/collaboration";
import { inviteMemberSchema, uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * Sends a Project invitation. Owner-only and seat-limited — both enforced
 * inside the `invite_project_member` Postgres function (see
 * supabase/migrations/0017_project_collaboration.sql), atomically under a
 * per-owner advisory lock so two concurrent invitations can't both slip
 * under the same remaining seat. This route is a thin, typed wrapper —
 * never re-implement the seat check here.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  const body = await request.json();
  const { email } = inviteMemberSchema.parse(body);

  const invitation = await inviteProjectMember(projectId, email);
  return NextResponse.json({ invitation }, { status: 201 });
});
