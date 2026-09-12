import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

/**
 * Shared safe Markdown renderer for every preview that needs one (Article,
 * Newsletter, Summary, and the spoken blocks of YouTube Script). Raw HTML
 * in the source is never rendered — react-markdown treats it as plain text
 * by default, and we don't add rehype-raw, so AI content stays untrusted-safe
 * without needing dangerouslySetInnerHTML anywhere.
 *
 * `variant="article"` is a bit larger/roomier for long-form reading;
 * `variant="compact"` is tighter, for newsletter/summary/script contexts.
 */
export function MarkdownContent({
  content,
  variant = "compact",
  className,
}: {
  content: string;
  variant?: "article" | "compact";
  className?: string;
}) {
  const isArticle = variant === "article";

  return (
    <div className={cn("flex flex-col break-words", isArticle ? "gap-4" : "gap-3", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              className={cn(
                "font-bold tracking-tight text-foreground",
                isArticle ? "text-2xl sm:text-3xl" : "text-xl"
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={cn(
                "font-semibold tracking-tight text-foreground",
                isArticle ? "mt-2 text-xl sm:text-2xl" : "mt-1 text-lg"
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={cn(
                "font-semibold text-foreground",
                isArticle ? "text-lg" : "text-base"
              )}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              className={cn(
                "leading-relaxed text-foreground",
                isArticle ? "text-base" : "text-sm"
              )}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul
              className={cn(
                "list-outside list-disc space-y-2 pl-6 marker:text-muted-foreground/60",
                isArticle ? "text-base" : "text-sm"
              )}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className={cn(
                "list-outside list-decimal space-y-2 pl-6 marker:font-medium marker:text-muted-foreground/60",
                isArticle ? "text-base" : "text-sm"
              )}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-4 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-border" />,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
