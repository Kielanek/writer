import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import { getUserProfile } from "@/lib/entitlements/profile";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { UsageLimitError } from "@/lib/entitlements/errors";
import type { Project, ProjectWithCounts } from "@/types";

export async function listProjectsWithCounts(): Promise<ProjectWithCounts[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!projects || projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);

  const [{ data: notes, error: notesError }, { data: documents, error: docsError }] =
    await Promise.all([
      supabase.from("notes").select("id, project_id").eq("user_id", user.id).in("project_id", projectIds),
      supabase.from("documents").select("id, project_id").eq("user_id", user.id).in("project_id", projectIds),
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

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Creates a Project, enforcing the plan's maxProjects limit atomically via
 * the create_project_with_limit() Postgres function (see
 * supabase/migrations/0007_usage_limits.sql) — a plain INSERT is no longer
 * possible here since `authenticated` has no INSERT grant on `projects` at
 * all, closing off any path that would let a client bypass the limit by
 * calling the REST API directly instead of going through this function.
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
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(projectId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) throw error;
}
