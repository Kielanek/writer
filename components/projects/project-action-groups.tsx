import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordNoteDialog } from "@/components/recording/record-note-dialog";
import { UploadAudioDialog } from "@/components/recording/upload-audio-dialog";
import { AddTextNoteDialog } from "@/components/notes/add-text-note-dialog";

export function ProjectActionGroups({ projectId }: { projectId: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
        <span className="px-0.5 text-sm font-medium text-foreground">Capture</span>
        <RecordNoteDialog projectId={projectId} />
        <UploadAudioDialog projectId={projectId} />
        <AddTextNoteDialog projectId={projectId} />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
        <span className="px-0.5 text-sm font-medium text-foreground">Create</span>
        <Button asChild variant="outline" className="h-11 w-full justify-start gap-2.5 text-sm font-medium">
          <Link href={`/projects/${projectId}/ask`}>
            <MessageCircle className="size-4" />
            Ask Project
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 w-full justify-start gap-2.5 text-sm font-medium">
          <Link href={`/projects/${projectId}/documents/new`}>
            <Plus className="size-4 text-emerald-600" />
            Create Document
          </Link>
        </Button>
      </div>
    </div>
  );
}
