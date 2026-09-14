import { NextResponse } from "next/server";
import { listMyPendingInvitations, resolveProjectNames, resolveUserEmails } from "@/lib/db/collaboration";
import { withApiErrorHandling } from "@/lib/utils/api";

/**
 * The caller's own pending Project invitations — matched to their verified
 * session email by RLS, never a client-supplied email (see
 * project_invitations_select policy). Includes the Project's name and the
 * inviter's email so the UI can show "Piotr invited you to: SEO Content
 * Strategy" without the invitee needing access to the Project yet.
 */
export const GET = withApiErrorHandling(async () => {
  const invitations = await listMyPendingInvitations();

  const [projectNames, inviterEmails] = await Promise.all([
    resolveProjectNames(invitations.map((inv) => inv.project_id)),
    resolveUserEmails(invitations.map((inv) => inv.invited_by)),
  ]);

  const enriched = invitations.map((inv) => ({
    ...inv,
    projectName: projectNames.get(inv.project_id) ?? "(deleted project)",
    invitedByEmail: inviterEmails.get(inv.invited_by) ?? null,
  }));

  return NextResponse.json({ invitations: enriched });
});
