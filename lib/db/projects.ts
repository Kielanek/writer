import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import { getUserProfile } from "@/lib/entitlements/profile";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { UsageLimitError } from "@/lib/entitlements/errors";
import type { Project, ProjectWithCounts } from "@/types";

async function attachCounts(
  projects: Project[]
): Promise<ProjectWithCounts[]> {
  const supabase = await getSupabaseServerClient();
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);

  // No `.eq("user_id", ...)` here on purpose: once a Project is shared,
  // these counts must reflect ALL Notes/Documents in it (created by anyone
  // with access), not just the caller's own rows — RLS already scopes
  // `projectIds` to Projects the caller can see at all.
  const [{ data: notes, error: notesError }, { data: documents, error: docsError }] = await Promise.all([
    supabase.from("notes").select("id, project_id").in("project_id", projectIds),
    supabase.from("documents").select("id, project_id").in("project_id", projectIds),
  ]);

  if (notesError) throw notesError;
  if (docsError) throw docsError;

  const noteCounts = new Map<string, number>();
  for (const n of notes ?? []) {
    noteCounts.set(n.project_id, (noteCounts.get(n.project_id) ?? 0) + 1);
  }

  const docCounts = new Map<string, number>();
  for (const d of documents ?? []) {
    docCounts.set(d.project_id, (docCounts.get(d.project_id) ?? 0) + 1);
  }

  return projects.map((p) => ({
    ...p,
    note_count: noteCounts.get(p.id) ?? 0,
    document_count: docCounts.get(p.id) ?? 0,
  }));
}

/** Projects this account OWNS — what counts against the plan's Project limit. */
export async function listMyProjectsWithCounts(): Promise<ProjectWithCounts[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return attachCounts(projects ?? []);
}

/** Projects shared WITH this account (they're a Member, not the Owner) — never counted against this account's own Project limit. */
export async function listSharedProjectsWithCounts(): Promise<ProjectWithCounts[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .neq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  // RLS on `projects` already restricts SELECT to owner-or-member rows, so
  // everything returned here that isn't owned by the caller is, by
  // definition, shared with them via project_members.
  return attachCounts(projects ?? []);
}

/**
 * A single Project, if the caller has ANY access to it (owner or member) —
 * enforced by RLS (`projects_select_own`), not by an application-level
 * `.eq("user_id", ...)` filter. That filter would silently hide a Project
 * from a Member who has genuine RLS-granted access to it — exactly the
 * "hidden filter defeats collaboration" bug the product spec calls out.
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Creates a Project, enforcing the plan's maxProjects limit atomically via
 * the create_project_with_limit() Postgres function (see
 * supabase/migrations/0007_usage_limits.sql and
 * 0017_project_collaboration.sql) — a plain INSERT is no longer possible
 * here since `authenticated` has no INSERT grant on `projects` at all,
 * closing off any path that would let a client bypass the limit by calling
 * the REST API directly instead of going through this function. The
 * creator always becomes `owner_id` — there is no way to create a Project
 * owned by someone else.
 */
export async function createProject(input: {
  name: string;
  description: string | null;
}): Promise<Project> {
  const supabase = await getSupabaseServerClient();
  const profile = await getUserProfile();
  const maxProjects = (await getPlanLimits(profile.planId)).maxProjects;

  const { data, error } = await supabase
    .rpc("create_project_with_limit", {
      p_name: input.name,
      p_description: input.description,
      p_max_projects: maxProjects,
    })
    .single();

  if (error) {
    if (error.message?.includes("project_limit_reached")) {
      throw new UsageLimitError({ resource: "projects", used: maxProjects, limit: maxProjects });
    }
    throw error;
  }
  return data as Project;
}

/** Owner-only (RLS-enforced via `projects_update_own`) — a Member cannot rename/redescribe a shared Project. Callers should check ownership themselves first for a clean 403 rather than relying solely on the RLS-driven error. */
export async function updateProject(
  projectId: string,
  input: { name?: string; description?: string | null }
): Promise<Project> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Owner-only (RLS-enforced via `projects_delete_own`). */
export async function deleteProject(projectId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) throw error;
}
