import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDocument, listDocumentVersions } from "@/lib/db/documents";
import { DocumentWorkspace } from "@/components/documents/document-workspace";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const document = await getDocument(documentId);

  if (!document || document.project_id !== projectId) notFound();

  const versions = await listDocumentVersions(documentId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Project
      </Link>

      <DocumentWorkspace document={document} initialVersions={versions} />
    </main>
  );
}
