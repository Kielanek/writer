import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/projects";
import {
  listProjectMembers,
  listProjectInvitations,
  getOwnerSeatUsage,
  resolveUserEmails,
} from "@/lib/db/collaboration";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getProfileForUser } from "@/lib/entitlements/profile";
import { requireUser } from "@/lib/supabase/auth";
import { uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * Everything the Share/Manage Access dialog needs in one call: who owns the
 * Project, its Members (with resolved emails), pending invitations (only
 * returned when the caller IS the owner — RLS already enforces this at the
 * table level, but the response shape stays clean either way), and the
 * Owner's seat usage/limit.
 */
export const GET = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const actor = await requireUser();
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  const project = await getProject(projectId);
  if (!project) throw new ApiError(404, "Project not found.");

  const isOwner = project.owner_id === actor.id;

  const [members, invitations, seatUsage, ownerProfile] = await Promise.all([
    listProjectMembers(projectId),
    isOwner ? listProjectInvitations(projectId) : Promise.resolve([]),
    getOwnerSeatUsage(project.owner_id),
    getProfileForUser(project.owner_id),
  ]);

  const seatLimit = (await getPlanLimits(ownerProfile.planId)).seatLimit;

  const emailIds = [project.owner_id, ...members.map((m) => m.user_id)];
  const emails = await resolveUserEmails(emailIds);

  return NextResponse.json({
    isOwner,
    owner: { id: project.owner_id, email: emails.get(project.owner_id) ?? null },
    members: members.map((m) => ({ ...m, email: emails.get(m.user_id) ?? null })),
    pendingInvitations: invitations,
    seatUsage,
    seatLimit,
  });
});
