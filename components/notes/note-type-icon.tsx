import { AudioLines, FileText, Mic } from "lucide-react";
import { cn } from "cn";
import type { NoteType } from "@/types";

export const NOTE_TYPE_ICON_CONFIG: Record<
  NoteType,
  { icon: typeof Mic; className: string; badgeClassName: string }
> = {
  recording: { icon: Mic, className: "bg-violet-50 text-violet-600", badgeClassName: "bg-violet-50 text-violet-600" },
  audio_upload: { icon: AudioLines, className: "bg-sky-50 text-sky-600", badgeClassName: "bg-sky-50 text-sky-600" },
  text: { icon: FileText, className: "bg-amber-50 text-amber-600", badgeClassName: "bg-amber-50 text-amber-600" },
};

/** Soft-tint icon chip per note type — same treatment as document type icons, for a consistent, gently colorful card list. */
export function NoteTypeIcon({ type, className }: { type: NoteType; className?: string }) {
  const { icon: Icon, className: tint } = NOTE_TYPE_ICON_CONFIG[type];

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        tint,
        className
      )}
    >
      <Icon className="size-4" strokeWidth={2} />
    </div>
  );
}
