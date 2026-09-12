import { MarkdownContent } from "@/components/documents/previews/markdown-content";

type ScriptBlock =
  | { kind: "heading"; text: string }
  | { kind: "annotation"; label: string; text: string }
  | { kind: "spoken"; content: string };

const ANNOTATION_PATTERN = /^\s*(B-ROLL|ON SCREEN|NOTE|CTA)\s*:\s*(.*)$/i;
const HEADING_PATTERN = /^#{1,3}\s+(.*)$/;

/**
 * Splits the script into spoken-copy / heading / production-annotation
 * blocks for display. Purely a rendering split — never rewrites or
 * invents content; a line that doesn't match a heading or an explicit
 * "LABEL:" annotation is always treated as spoken copy.
 */
function parseScript(content: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let buffer: string[] = [];

  function flushBuffer() {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ kind: "spoken", content: text });
    buffer = [];
  }

  for (const line of content.split("\n")) {
    const headingMatch = line.match(HEADING_PATTERN);
    const annotationMatch = line.match(ANNOTATION_PATTERN);

    if (headingMatch) {
      flushBuffer();
      blocks.push({ kind: "heading", text: headingMatch[1].trim() });
    } else if (annotationMatch) {
      flushBuffer();
      blocks.push({ kind: "annotation", label: annotationMatch[1].toUpperCase(), text: annotationMatch[2].trim() });
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();

  return blocks;
}

export function YouTubeScriptPreview({ content }: { content: string }) {
  const blocks = parseScript(content);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <div key={i} className="mt-2 flex items-center gap-3 first:mt-0">
              <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {block.text}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          );
        }

        if (block.kind === "annotation") {
          return (
            <div
              key={i}
              className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground"
            >
              <span className="font-semibold text-foreground">{block.label}:</span>{" "}
              {block.text}
            </div>
          );
        }

        return <MarkdownContent key={i} content={block.content} variant="article" />;
      })}
    </div>
  );
}
