import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import type { Note, NoteType } from "@/types";

/**
 * All note queries are scoped by project_id AND user_id. This is the
 * low-level data access layer — context isolation is additionally enforced
 * in lib/context/buildProjectContext.ts, which is the ONLY place AI
 * features should pull notes from.
 */

export async function listNotesForProject(projectId: string): Promise<Note[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getNote(noteId: string): Promise<Note | null> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", user.id)
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
  const user = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .update(input)
    .eq("id", noteId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNote(noteId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", user.id);

  if (error) throw error;
}
