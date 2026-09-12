"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Clock, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoteTypeIcon } from "@/components/notes/note-type-icon";
import { formatDuration, formatRelativeTime } from "@/lib/utils/format";
import { NOTE_TYPE_LABELS } from "@/types";
import type { Note } from "@/types";

export function NoteCard({ note }: { note: Note }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete note.");
      }
      toast.success("Note deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete note.");
      throw err;
    }
  }

  function stopEventFromReachingLink(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <div className="relative rounded-xl border bg-card transition-colors hover:border-foreground/20 focus-within:border-foreground/20">
      <Link
        href={`/projects/${note.project_id}/notes/${note.id}`}
        className="block rounded-xl p-3.5 outline-none sm:p-4"
      >
        <div className="flex items-start gap-3 pr-8">
          <NoteTypeIcon type={note.type} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
              {note.title || "Untitled note"}
            </h3>
            {note.description ? (
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {note.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {NOTE_TYPE_LABELS[note.type]}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {formatRelativeTime(note.created_at)}
              </span>
              {note.duration_seconds != null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <AudioLines className="size-3" />
                  {formatDuration(note.duration_seconds)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2.5 top-2.5 size-7 text-muted-foreground/70 hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
            aria-label="Note actions"
            onClick={stopEventFromReachingLink}
            onPointerDown={stopEventFromReachingLink}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this note?"
        description="This will permanently delete the note. This cannot be undone."
        confirmLabel="Delete Note"
        onConfirm={handleDelete}
      />
    </div>
  );
}
