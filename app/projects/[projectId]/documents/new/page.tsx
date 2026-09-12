import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/db/projects";
import { CreateDocumentForm } from "@/components/documents/create-document-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Project
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Document</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a document type, then describe what you want. The AI will use all notes
          in this project.
        </p>
      </div>

      <CreateDocumentForm projectId={projectId} />
    </main>
  );
}
