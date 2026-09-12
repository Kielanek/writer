"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentTypeIcon } from "@/components/documents/document-type-icon";
import { formatRelativeTime } from "@/lib/utils/format";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import type { Document } from "@/types";

export function DocumentCard({ document }: { document: Document }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete document.");
      }
      toast.success("Document deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete document.");
      throw err;
    }
  }

  function stopEventFromReachingLink(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <div className="relative rounded-xl border bg-card transition-colors hover:border-foreground/20 focus-within:border-foreground/20">
      <Link
        href={`/projects/${document.project_id}/documents/${document.id}`}
        className="block rounded-xl p-3.5 outline-none sm:p-4"
      >
        <div className="flex items-start gap-3 pr-8">
          <DocumentTypeIcon type={document.type} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
              {document.title}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[document.type]}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/90">
              Updated {formatRelativeTime(document.updated_at)}
            </p>
          </div>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2.5 top-2.5 size-7 text-muted-foreground/70 hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
            aria-label="Document actions"
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
        title="Delete this document?"
        description="This will permanently delete the document and all of its version history. This cannot be undone."
        confirmLabel="Delete Document"
        onConfirm={handleDelete}
      />
    </div>
  );
}
