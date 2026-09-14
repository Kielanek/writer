import { ListChecks, Mail, Newspaper, Share2, Video } from "lucide-react";
import { cn } from "cn";
import type { DocumentType } from "@/types";

export const DOCUMENT_TYPE_ICON_CONFIG: Record<
  DocumentType,
  { icon: typeof Video; className: string; badgeClassName: string }
> = {
  // Legacy only — youtube_script is no longer user-selectable, but old
  // Documents of this type still need an icon to render.
  youtube_script: { icon: Video, className: "bg-red-50 text-red-500", badgeClassName: "bg-red-50 text-red-600" },
  linkedin_post: { icon: Share2, className: "bg-blue-50 text-blue-500", badgeClassName: "bg-blue-50 text-blue-600" },
  newsletter: { icon: Mail, className: "bg-amber-50 text-amber-600", badgeClassName: "bg-amber-50 text-amber-600" },
  article: { icon: Newspaper, className: "bg-slate-100 text-slate-600", badgeClassName: "bg-slate-100 text-slate-600" },
  summary: { icon: ListChecks, className: "bg-emerald-50 text-emerald-600", badgeClassName: "bg-emerald-50 text-emerald-600" },
};

/** Consistent icon + soft-tint container for a document type. Same size/shape for every type. */
export function DocumentTypeIcon({
  type,
  className,
}: {
  type: DocumentType;
  className?: string;
}) {
  const { icon: Icon, className: tint } = DOCUMENT_TYPE_ICON_CONFIG[type];

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
