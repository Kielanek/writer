export type NoteType = "recording" | "audio_upload" | "text";

export type DocumentType =
  | "linkedin_post"
  | "article"
  | "newsletter"
  | "summary"
  /**
   * Legacy only. YouTube Script has been removed from the active product —
   * it is no longer creatable or selectable anywhere in the UI, but old
   * Documents of this type may still exist in the database and must keep
   * rendering (read-only/generic fallback) rather than crash. Kept in this
   * union so every `Record<DocumentType, ...>` lookup stays exhaustive and
   * type-safe for that legacy data, instead of needing `as DocumentType`
   * casts scattered through the codebase.
   */
  | "youtube_script";

export type DocumentVersionSource = "initial" | "ai_edit" | "manual" | "restore";

export type ChatRole = "user" | "assistant";

export interface Project {
  id: string;
  /** Legacy single-user column — kept for backward compatibility, no longer the access boundary. Always equal to owner_id for a Project created after collaboration shipped. */
  user_id: string;
  /** The Project's economic/administrative owner — the access/limit/billing boundary. See lib/db/collaboration.ts. */
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithCounts extends Project {
  note_count: number;
  document_count: number;
}

/** Only role that exists today — see the collaboration model's doc comments for why Owner isn't duplicated into this table. */
export type ProjectMemberRole = "member";

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  added_by: string | null;
  created_at: string;
}

export type ProjectInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  invited_by: string;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface Note {
  id: string;
  project_id: string;
  user_id: string;
  type: NoteType;
  title: string;
  description: string;
  content: string;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  user_id: string;
  type: DocumentType;
  title: string;
  creation_instructions: string;
  content: string;
  /** Id of the preset (built-in or custom) used to generate this Document. Reference only — see preset_snapshot for the source of truth. */
  preset_id: string | null;
  /** Frozen preset rules at generation time. Raw JSONB — see lib/writing-engine/snapshot.ts for typed access. */
  preset_snapshot: unknown;
  writing_engine_version: number;
  /**
   * Frozen SEO configuration — primaryKeyword, secondaryKeywords, and
   * (once generated or manually entered) metaTitle/metaDescription for the
   * Google search-result preview. Every Article is SEO-focused, so every new
   * `article` Document carries one. Raw JSONB — see
   * lib/writing-engine/seoKeywords.ts for typed access. Null for every
   * non-article type, and for Articles created before SEO keywords became
   * mandatory (legacy — still opens normally, just with no highlighting/meta
   * editor until keywords are added).
   */
  seo_settings: unknown;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  user_id: string;
  version_number: number;
  content: string;
  source: DocumentVersionSource;
  instruction: string | null;
  restored_from_version: number | null;
  /** Frozen SEO state (see Document.seo_settings) at the moment this version was created. Null for non-Article Documents and for versions created before this existed. */
  seo_settings: unknown;
  /** The real acting user who created this version — may differ from the Document's own (creator) user_id once a collaborator edits someone else's Document. Null for versions created before this existed. */
  created_by: string | null;
  created_at: string;
}

export interface ProjectChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  linkedin_post: "LinkedIn Post",
  article: "Article",
  newsletter: "Newsletter",
  summary: "Summary",
  // Legacy label only — never shown as a creation option.
  youtube_script: "YouTube Script",
};

/** Document types a user can currently choose when creating a new Document. */
export const CREATABLE_DOCUMENT_TYPES = [
  "linkedin_post",
  "article",
  "newsletter",
  "summary",
] as const satisfies readonly DocumentType[];

export type CreatableDocumentType = (typeof CREATABLE_DOCUMENT_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  recording: "Recording",
  audio_upload: "Audio Upload",
  text: "Text Note",
};
