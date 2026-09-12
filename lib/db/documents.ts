import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import type { Document, DocumentType, DocumentVersion, DocumentVersionSource } from "@/types";

export async function listDocumentsForProject(projectId: string): Promise<Document[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDocument(documentId: string): Promise<Document | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createDocument(input: {
  projectId: string;
  type: DocumentType;
  title: string;
  creationInstructions: string;
  content: string;
  presetId: string;
  presetSnapshot: unknown;
  writingEngineVersion: number;
  /** Frozen SEO keyword configuration — mandatory for new Articles. Null for every other type. */
  seoSettings: unknown;
}): Promise<Document> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: input.projectId,
      type: input.type,
      title: input.title,
      creation_instructions: input.creationInstructions,
      content: input.content,
      preset_id: input.presetId,
      preset_snapshot: input.presetSnapshot,
      writing_engine_version: input.writingEngineVersion,
      seo_settings: input.seoSettings ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Autosave-only update. Does NOT create a version history entry. */
export async function updateDocumentContent(
  documentId: string,
  input: { title?: string; content?: string; seoSettings?: unknown }
): Promise<Document> {
  const supabase = getSupabaseServerClient();
  const { title, content, seoSettings } = input;
  const update: Record<string, unknown> = {};
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (seoSettings !== undefined) update.seo_settings = seoSettings;

  const { data, error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", documentId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDocumentVersion(
  documentId: string,
  versionNumber: number
): Promise<DocumentVersion | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Creates a new document version AND updates the document's working content,
 * atomically, via the `create_document_version` Postgres function. This is
 * the only supported way to write a version — it guarantees linear,
 * gap-free version numbering even under concurrent requests.
 */
export async function createDocumentVersion(input: {
  documentId: string;
  content: string;
  source: DocumentVersionSource;
  instruction?: string | null;
  restoredFromVersion?: number | null;
}): Promise<DocumentVersion> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_document_version", {
      p_document_id: input.documentId,
      p_content: input.content,
      p_source: input.source,
      p_instruction: input.instruction ?? null,
      p_restored_from_version: input.restoredFromVersion ?? null,
    })
    .single();

  if (error) throw error;
  return data as DocumentVersion;
}
