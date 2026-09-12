import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/db/projects";
import { listNotesForProject } from "@/lib/db/notes";
import { listDocumentsForProject } from "@/lib/db/documents";
import { ProjectHeader } from "@/components/projects/project-header";
import { ProjectActionGroups } from "@/components/projects/project-action-groups";
import { NotesSection } from "@/components/notes/notes-section";
import { DocumentsSection } from "@/components/documents/documents-section";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) notFound();

  const [notes, documents] = await Promise.all([
    listNotesForProject(projectId),
    listDocumentsForProject(projectId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 bg-neutral-50/60 px-4 py-5 sm:px-6 sm:py-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <ProjectHeader project={project} noteCount={notes.length} documentCount={documents.length} />

      <ProjectActionGroups projectId={projectId} />

      <NotesSection notes={notes} />

      <DocumentsSection projectId={projectId} documents={documents} />
    </main>
  );
}
