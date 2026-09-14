import { Mic } from "lucide-react";
import { NoteCard } from "@/components/notes/note-card";
import { SectionHeader } from "@/components/projects/section-header";
import type { Note } from "@/types";

export function NotesSection({ notes }: { notes: Note[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Notes" count={notes.length} />

      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-violet-50 text-violet-500">
            <Mic className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            No notes yet. Record your first idea.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </section>
  );
}
