import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getNote } from "@/lib/db/notes";
import { NoteEditor } from "@/components/notes/note-editor";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
}: {
  params: Promise<{ projectId: string; noteId: string }>;
}) {
  const { projectId, noteId } = await params;
  const note = await getNote(noteId);

  if (!note || note.project_id !== projectId) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Project
      </Link>

      <NoteEditor note={note} />
    </main>
  );
}
