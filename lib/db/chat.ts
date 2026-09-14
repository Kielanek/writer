import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import type { ChatRole, ProjectChatMessage } from "@/types";

/** Access is Project-membership-based (RLS), not `user_id` — every collaborator shares one Ask Project conversation per Project. */

export async function listChatMessages(projectId: string): Promise<ProjectChatMessage[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("project_chat_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createChatMessage(input: {
  projectId: string;
  role: ChatRole;
  content: string;
}): Promise<ProjectChatMessage> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("project_chat_messages")
    .insert({ project_id: input.projectId, user_id: user.id, role: input.role, content: input.content })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function clearChatMessages(projectId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { error } = await supabase
    .from("project_chat_messages")
    .delete()
    .eq("project_id", projectId);

  if (error) throw error;
}
