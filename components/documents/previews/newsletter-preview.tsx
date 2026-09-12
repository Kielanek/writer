import { MarkdownContent } from "@/components/documents/previews/markdown-content";

export function NewsletterPreview({ content, title }: { content: string; title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">From</span>
          <span className="font-medium text-foreground">Your Newsletter</span>
        </div>
        <div className="mt-1 flex gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">Subject</span>
          <span className="font-medium text-foreground">{title || "(untitled)"}</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <MarkdownContent content={content} variant="compact" />
      </div>
    </div>
  );
}
