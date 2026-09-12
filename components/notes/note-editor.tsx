"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SaveStatus } from "@/components/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { formatDuration, formatRelativeTime } from "@/lib/utils/format";
import { NOTE_TYPE_LABELS } from "@/types";
import type { Note } from "@/types";

export function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description);
  const [content, setContent] = useState(note.content);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function saveField(field: "title" | "description" | "content", value: string) {
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error("Save failed");
  }

  const titleStatus = useAutosave(title, (v) => saveField("title", v));
  const descriptionStatus = useAutosave(description, (v) => saveField("description", v));
  const contentStatus = useAutosave(content, (v) => saveField("content", v));

  const overallStatus =
    [titleStatus, descriptionStatus, contentStatus].find((s) => s === "saving") ??
    [titleStatus, descriptionStatus, contentStatus].find((s) => s === "error") ??
    (titleStatus === "saved" || descriptionStatus === "saved" || contentStatus === "saved"
      ? "saved"
      : "idle");

  async function handleDelete() {
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete note.");
      }
      toast.success("Note deleted");
      router.push(`/projects/${note.project_id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete note.");
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{NOTE_TYPE_LABELS[note.type]}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(note.created_at)}
            {note.duration_seconds != null ? ` · ${formatDuration(note.duration_seconds)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus status={overallStatus} />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete note"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          className="text-base font-semibold"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note-description">Short description</Label>
        <Textarea
          id="note-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note-content">Content</Label>
        <Textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          maxLength={50_000}
          className="font-normal leading-relaxed"
        />
      </div>

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
