import "server-only";
import { getProject } from "@/lib/db/projects";
import { listNotesForProject } from "@/lib/db/notes";
import type { Note, Project } from "@/types";

export class ProjectContextError extends Error {}

/**
 * A very rough token estimate (chars / 4). Good enough for a soft budget
 * check — not meant to be exact.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Approximate context-window budget reserved for Project notes. Leaves
// headroom for system instructions, the model's own output, and other
// prompt parts. This is intentionally conservative and centralized here so
// it can be tuned in one place as models/limits change.
const MAX_NOTES_CONTEXT_TOKENS = 60_000;

export interface ProjectContext {
  project: Project;
  notes: Note[];
  /** All notes formatted as a single text block, ready to insert into a prompt. */
  notesText: string;
  estimatedTokens: number;
}

/**
 * THE single, centralized way to load a Project's knowledge for any AI
 * operation (document generation, document editing, Ask Project).
 *
 * Strictly scoped to `projectId` — it must never be modified to pull notes
 * across projects. Every caller that needs "the Project's knowledge" MUST
 * go through this function rather than querying notes directly, so that
 * context isolation is enforced in one place instead of being re-implemented
 * (and potentially broken) at every call site.
 *
 * MVP implementation: returns every note in the Project, concatenated.
 * Future implementation (RAG / embeddings / summarization / semantic
 * retrieval) can replace the internals without changing this function's
 * signature or its callers.
 */
export async function buildProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await getProject(projectId);
  if (!project) {
    throw new ProjectContextError("Project not found.");
  }

  const notes = await listNotesForProject(projectId);

  const notesText = notes
    .map((note, index) => {
      const heading = note.title || `Note ${index + 1}`;
      return `### ${heading}\n${note.content}`;
    })
    .join("\n\n");

  const estimatedTokens = estimateTokens(notesText);

  if (estimatedTokens > MAX_NOTES_CONTEXT_TOKENS) {
    throw new ProjectContextError(
      "This Project has accumulated too many notes for a single AI request. " +
        "Try splitting your notes across Projects, or shorten some notes."
    );
  }

  return { project, notes, notesText, estimatedTokens };
}
