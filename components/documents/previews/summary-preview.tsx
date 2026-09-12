import { MarkdownContent } from "@/components/documents/previews/markdown-content";

export function SummaryPreview({ content }: { content: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border bg-card p-4 sm:p-5">
      <MarkdownContent content={content} variant="compact" />
    </div>
  );
}
