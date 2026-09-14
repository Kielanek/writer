"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { formatRelativeTime } from "@/lib/utils/format";
import { pickPastelTag } from "@/lib/utils/colorTag";
import type { ProjectWithCounts } from "@/types";

export function ProjectCard({ project: initialProject }: { project: ProjectWithCounts }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete project.");
      }
      toast.success("Project deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project.");
      throw err;
    }
  }

  return (
    <div className="group relative rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <Link href={`/projects/${project.id}`} className="block pr-8">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              pickPastelTag(project.id)
            )}
          >
            <Folder className="size-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold leading-snug">{project.name}</h2>
            {project.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {project.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{project.note_count} {project.note_count === 1 ? "note" : "notes"}</span>
              <span aria-hidden>·</span>
              <span>{project.document_count} {project.document_count === 1 ? "document" : "documents"}</span>
              <span aria-hidden>·</span>
              <span>Updated {formatRelativeTime(project.updated_at)}</span>
            </div>
          </div>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-8 text-muted-foreground"
            aria-label="Project actions"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Rename / Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated) => setProject((p) => ({ ...p, ...updated }))}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this project?"
        description={`This will permanently delete "${project.name}" along with all of its notes, documents, and chat history. This cannot be undone.`}
        confirmLabel="Delete Project"
        onConfirm={handleDelete}
      />
    </div>
  );
}
