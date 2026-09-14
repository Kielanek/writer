import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import type { Note, NoteType } from "@/types";

/**
 * Access is governed by Project membership (RLS: `can_access_project`), not
 * by `notes.user_id` — that column is creator ATTRIBUTION only now, never
 * the access boundary. Queries are scoped by `project_id` alone (never
 * `.eq("user_id", ...)`, which would silently hide a collaborator's Notes
 * from everyone else with real access to the Project). Context isolation is
 * additionally enforced in lib/context/buildProjectContext.ts, which is the
 * ONLY place AI features should pull notes from.
 */

export async function listNotesForProject(projectId: string): Promise<Note[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getNote(noteId: string): Promise<Note | null> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createNote(input: {
  projectId: string;
  type: NoteType;
  title: string;
  description: string;
  content: string;
  durationSeconds?: number | null;
}): Promise<Note> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      project_id: input.projectId,
      user_id: user.id,
      type: input.type,
      title: input.title,
      description: input.description,
      content: input.content,
      duration_seconds: input.durationSeconds ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateNote(
  noteId: string,
  input: { title?: string; description?: string; content?: string }
): Promise<Note> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .update(input)
    .eq("id", noteId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNote(noteId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId);

  if (error) throw error;
}
