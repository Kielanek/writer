import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import type { Note, NoteType } from "@/types";

/**
 * All note queries are scoped by project_id. This is the low-level data
 * access layer — context isolation is additionally enforced in
 * lib/context/buildProjectContext.ts, which is the ONLY place AI features
 * should pull notes from.
 */

export async function listNotesForProject(projectId: string): Promise<Note[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getNote(noteId: string): Promise<Note | null> {
  const supabase = getSupabaseServerClient();
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
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      project_id: input.projectId,
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
  const supabase = getSupabaseServerClient();
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
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw error;
}
