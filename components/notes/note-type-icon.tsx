import { AudioLines, FileText, Mic } from "lucide-react";
import { cn } from "cn";
import type { NoteType } from "@/types";

const NOTE_TYPE_ICONS: Record<NoteType, typeof Mic> = {
  recording: Mic,
  audio_upload: AudioLines,
  text: FileText,
};

/** Neutral icon treatment for note types — deliberately quieter than document type icons. */
export function NoteTypeIcon({ type, className }: { type: NoteType; className?: string }) {
  const Icon = NOTE_TYPE_ICONS[type];

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="size-4" strokeWidth={2} />
    </div>
  );
}
