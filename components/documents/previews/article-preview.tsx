import { MarkdownContent } from "@/components/documents/previews/markdown-content";

export function ArticlePreview({ content }: { content: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <MarkdownContent content={content} variant="article" />
    </div>
  );
}
