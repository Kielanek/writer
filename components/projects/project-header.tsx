"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FileText, MoreVertical, Notebook, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import type { Project } from "@/types";

export function ProjectHeader({
  project: initialProject,
  noteCount,
  documentCount,
}: {
  project: Project;
  noteCount: number;
  documentCount: number;
}) {
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
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project.");
      throw err;
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-xl font-bold leading-snug tracking-tight text-balance sm:text-2xl">
          {project.name}
        </h1>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1.5 -mt-1 shrink-0 text-muted-foreground"
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
      </div>

      {project.description ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {project.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground/90">
        <span className="inline-flex items-center gap-1.5">
          <Notebook className="size-3.5" />
          {noteCount} {noteCount === 1 ? "note" : "notes"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-3.5" />
          {documentCount} {documentCount === 1 ? "document" : "documents"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" />
          Updated {formatRelativeTime(project.updated_at)}
        </span>
      </div>

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
