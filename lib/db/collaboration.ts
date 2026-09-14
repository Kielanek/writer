import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { ApiError } from "@/lib/utils/api";
import type { ProjectInvitation, ProjectMember } from "@/types";

/**
 * All mutations here go through the SECURITY DEFINER RPCs in
 * 0017_project_collaboration.sql — `project_members`/`project_invitations`
 * have ZERO direct write grant for `authenticated`, matching how this app
 * already treats every other limit/security-sensitive table. Every RPC
 * derives the acting user from the session itself; none of these functions
 * accept or trust a caller-supplied identity for "who is doing this."
 */

const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_project_owner: "Only the Project owner can do that.",
  project_not_found: "Project not found.",
  invalid_email: "Enter a valid email address.",
  cannot_invite_owner: "You can't invite yourself — you already own this Project.",
  already_member: "This person already has access to the Project.",
  already_invited: "There's already a pending invitation for this email.",
  seat_limit_reached: "You've used all the seats included in your plan.",
  invitation_not_found: "Invitation not found.",
  invitation_not_pending: "This invitation has already been used.",
  invitation_expired: "This invitation has expired.",
  invitation_email_mismatch: "This invitation was sent to a different email address.",
  owner_cannot_leave: "The Project owner can't leave their own Project — delete it instead.",
};

/** Turns one of the RPCs' `raise exception '<code>'` errors into a clean ApiError with product copy, instead of a raw Postgres error message. */
function toApiError(error: { message?: string } | null): ApiError | null {
  if (!error?.message) return null;
  for (const [code, message] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (error.message.includes(code)) {
      const status = code === "not_project_owner" ? 403 : code === "project_not_found" || code === "invitation_not_found" ? 404 : 400;
      return new ApiError(status, message);
    }
  }
  return null;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("project_invitations")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** The caller's own pending invitations — matched server-side to their verified session email via RLS (`email = lower(auth.email())`), never a client-supplied email. */
export async function listMyPendingInvitations(): Promise<ProjectInvitation[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("project_invitations")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function inviteProjectMember(projectId: string, email: string): Promise<ProjectInvitation> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("invite_project_member", { p_project_id: projectId, p_email: email })
    .single();

  if (error) throw toApiError(error) ?? error;
  return data as ProjectInvitation;
}

export async function acceptProjectInvitation(invitationId: string): Promise<ProjectMember> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("accept_project_invitation", { p_invitation_id: invitationId })
    .single();

  if (error) throw toApiError(error) ?? error;
  return data as ProjectMember;
}

export async function declineProjectInvitation(invitationId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("decline_project_invitation", { p_invitation_id: invitationId });
  if (error) throw toApiError(error) ?? error;
}

export async function revokeProjectInvitation(invitationId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_project_invitation", { p_invitation_id: invitationId });
  if (error) throw toApiError(error) ?? error;
}

export async function removeProjectMember(projectId: string, memberUserId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("remove_project_member", {
    p_project_id: projectId,
    p_member_user_id: memberUserId,
  });
  if (error) throw toApiError(error) ?? error;
}

export async function leaveProject(projectId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("leave_project", { p_project_id: projectId });
  if (error) throw toApiError(error) ?? error;
}

export async function getOwnerSeatUsage(ownerId: string): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_owner_seat_usage", { p_owner_id: ownerId });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Resolves Project names for a batch of ids — via the admin client, since
 * the caller (someone with a pending invitation, not yet a Member) has no
 * RLS-granted access to the Projects table for a Project they haven't
 * joined yet. Used only to show "<Owner> invited you to: <Project name>" —
 * never to expose Project content itself.
 */
export async function resolveProjectNames(projectIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const unique = Array.from(new Set(projectIds));
  if (unique.length === 0) return new Map();

  const { data, error } = await admin.from("projects").select("id, name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

/**
 * Resolves emails for a batch of member/invitation rows for display (e.g.
 * "Shared by john@example.com") — via the admin client's GoTrue lookup,
 * since `auth.users` isn't queryable from the session client. Best-effort:
 * a user id that can't be resolved (deleted account) maps to `null` rather
 * than failing the whole batch.
 */
export async function resolveUserEmails(userIds: string[]): Promise<Map<string, string | null>> {
  const admin = createAdminClient();
  const unique = Array.from(new Set(userIds));
  const entries = await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      return [id, error || !data.user ? null : (data.user.email ?? null)] as const;
    })
  );
  return new Map(entries);
}
