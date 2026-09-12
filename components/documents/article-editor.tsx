"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { Bold, Heading1, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { cn } from "cn";
import { SeoKeywordHighlight, type KeywordHighlightSpec } from "@/components/documents/seo-keyword-highlight-extension";
import { PRIMARY_HIGHLIGHT_CLASS, secondaryHighlightClass } from "@/components/documents/seo-keyword-colors";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

/**
 * Editorial-width, article-styled tag targeting so the editor's rendered
 * output matches components/documents/previews/markdown-content.tsx's
 * "article" variant as closely as possible — same type scale, same list
 * treatment — just applied to raw DOM tags instead of react-markdown's
 * `components` map, since Tiptap renders real HTML directly.
 */
const ARTICLE_PROSE_CLASSES = cn(
  "flex flex-col gap-4 break-words",
  "[&_h1]:text-2xl [&_h1]:sm:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground",
  "[&_h2]:mt-2 [&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
  "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_p]:text-base [&_p]:leading-relaxed [&_p]:text-foreground",
  "[&_strong]:font-semibold [&_em]:italic",
  "[&_ul]:list-outside [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-base [&_ul]:marker:text-muted-foreground/60",
  "[&_ol]:list-outside [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ol]:text-base [&_ol]:marker:text-muted-foreground/60 [&_ol]:marker:font-medium",
  "[&_li]:pl-1 [&_li]:leading-relaxed",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-muted-foreground/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-foreground"
);

function getMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as { markdown: MarkdownStorage };
  return storage.markdown.getMarkdown();
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()} // keep selection alive
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * `seoKeywords` is optional — null for a legacy Article created before SEO
 * keywords were mandatory, in which case no highlighting decorations are
 * loaded at all. Frozen for the document session: read once at editor
 * creation, since a Document's SEO keywords don't change mid-session (the
 * caller remounts this component by key if that ever happens, e.g. right
 * after "Add SEO Keywords" on a legacy Article).
 */
export function ArticleEditor({
  content,
  onChange,
  seoKeywords,
}: {
  content: string;
  onChange: (markdown: string) => void;
  seoKeywords?: SeoKeywordConfig | null;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // Tracks the last markdown string this editor itself produced, so the
  // external-sync effect below can tell "the parent echoed our own edit
  // back down as a prop" (skip, would disrupt the cursor) apart from
  // "content changed for another reason" (AI edit, restore, applied here).
  const lastEmittedRef = useRef(content);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const keywordHighlights = useMemo<KeywordHighlightSpec[]>(() => {
    if (!seoKeywords) return [];
    return [
      { keyword: seoKeywords.primaryKeyword, className: PRIMARY_HIGHLIGHT_CLASS },
      ...seoKeywords.secondaryKeywords.map((keyword, index) => ({
        keyword,
        className: secondaryHighlightClass(index),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frozen for the document session, read once at editor creation
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown.configure({ html: false, transformPastedText: true }),
      ...(keywordHighlights.length > 0 ? [SeoKeywordHighlight.configure({ keywords: keywordHighlights })] : []),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(ARTICLE_PROSE_CLASSES, "min-h-[12rem] focus:outline-none"),
      },
    },
    onUpdate: ({ editor: e }) => {
      const markdown = getMarkdown(e);
      lastEmittedRef.current = markdown;
      onChangeRef.current(markdown);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (content !== lastEmittedRef.current) {
      lastEmittedRef.current = content;
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkInputOpen(false);
    setLinkUrl("");
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
      >
        {linkInputOpen ? (
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkInputOpen(false);
            }}
            onBlur={applyLink}
            placeholder="https://..."
            className="h-8 w-48 rounded-md border-0 bg-transparent px-2 text-sm outline-none"
          />
        ) : (
          <>
            <ToolbarButton
              label="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Heading 1"
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Heading 2"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Heading 3"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Bulleted list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Link"
              active={editor.isActive("link")}
              onClick={() => {
                setLinkUrl(editor.getAttributes("link").href ?? "");
                setLinkInputOpen(true);
              }}
            >
              <LinkIcon className="size-4" />
            </ToolbarButton>
          </>
        )}
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}
