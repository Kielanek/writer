import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentCard } from "@/components/documents/document-card";
import { SectionHeader } from "@/components/projects/section-header";
import type { Document } from "@/types";

export function DocumentsSection({
  projectId,
  documents,
}: {
  projectId: string;
  documents: Document[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Documents"
        count={documents.length}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${projectId}/documents/new`}>
              <Plus className="size-4 text-emerald-600" />
              Create Document
            </Link>
          </Button>
        }
      />

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-fuchsia-50 text-fuchsia-500">
            <Sparkles className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            No documents yet. Turn your notes into something useful.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      )}
    </section>
  );
}
