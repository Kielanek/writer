import { LinkedInPreview } from "@/components/documents/previews/linkedin-preview";
import { ArticlePreview } from "@/components/documents/previews/article-preview";
import { NewsletterPreview } from "@/components/documents/previews/newsletter-preview";
import { YouTubeScriptPreview } from "@/components/documents/previews/youtube-script-preview";
import { SummaryPreview } from "@/components/documents/previews/summary-preview";
import type { DocumentType } from "@/types";

/**
 * Dispatches to the right platform-appropriate renderer for a Document's
 * type. Purely presentational — reads `content` as-is and never mutates
 * the Document. Add a new type here (and a matching component under
 * previews/) rather than growing any single renderer to handle every type.
 */
export function DocumentPreview({
  type,
  title,
  content,
}: {
  type: DocumentType;
  title: string;
  content: string;
}) {
  if (!content.trim()) {
    return (
      <p className="mx-auto w-full max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Nothing to preview yet.
      </p>
    );
  }

  switch (type) {
    case "linkedin_post":
      return <LinkedInPreview content={content} />;
    case "article":
      // DocumentWorkspace routes "article" to the enhanced ArticleEditor
      // directly; this case only covers switch exhaustiveness and any
      // fallback path that renders a plain preview for it.
      return <ArticlePreview content={content} />;
    case "newsletter":
      return <NewsletterPreview content={content} title={title} />;
    case "youtube_script":
      return <YouTubeScriptPreview content={content} />;
    case "summary":
      return <SummaryPreview content={content} />;
  }
}
