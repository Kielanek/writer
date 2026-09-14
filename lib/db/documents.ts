import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import { requireUser } from "@/lib/supabase/auth";
import type { Document, DocumentType, DocumentVersion, DocumentVersionSource } from "@/types";

/** Access is Project-membership-based (RLS: `can_access_project`), not `documents.user_id` — that column is creator attribution only now. Never filter these queries by `.eq("user_id", ...)`; that would hide a collaborator's Documents from everyone else with real access to the Project. */

export async function listDocumentsForProject(projectId: string): Promise<Document[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDocument(documentId: string): Promise<Document | null> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

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
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: input.projectId,
      user_id: user.id,
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
  input: {
    title?: string;
    content?: string;
    /** Full SEO config (primaryKeyword, secondaryKeywords, metaTitle, metaDescription) — always the whole object, never a partial merge; see lib/writing-engine/seoKeywords.ts. */
    seoSettings?: unknown;
  }
): Promise<Document> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

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
  const supabase = await getSupabaseServerClient();
  await requireUser();

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) throw error;
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const supabase = await getSupabaseServerClient();
  await requireUser();

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
  const supabase = await getSupabaseServerClient();
  await requireUser();

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
 *
 * Access is enforced by the function itself, which re-reads the parent
 * Document under `documents_select_own`'s (now Project-membership-based)
 * RLS — so this can only ever be called against a Document the caller can
 * actually access, owner or Member alike. The version's `created_by` is
 * stamped as the real acting user (`auth.uid()` inside the function), which
 * may differ from the Document's own `user_id` (its original creator).
 */
export async function createDocumentVersion(input: {
  documentId: string;
  content: string;
  source: DocumentVersionSource;
  instruction?: string | null;
  restoredFromVersion?: number | null;
  /** Snapshots the Article's current SEO state (keywords + meta title/description) onto this version, and — via create_document_version()'s coalesce — applies it back to the live document too. Pass the version being restored FROM to make "Restore" bring SEO state back with it; pass the document's current seo_settings for an ordinary save/edit (a no-op merge). Omit entirely for non-Article Documents. */
  seoSettings?: unknown;
}): Promise<DocumentVersion> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_document_version", {
      p_document_id: input.documentId,
      p_content: input.content,
      p_source: input.source,
      p_instruction: input.instruction ?? null,
      p_restored_from_version: input.restoredFromVersion ?? null,
      p_seo_settings: input.seoSettings ?? null,
    })
    .single();

  if (error) throw error;
  return data as DocumentVersion;
}
