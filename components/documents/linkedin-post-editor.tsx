"use client";

import { useEffect, useRef } from "react";
import { MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";

// LinkedIn's own editor truncates posts around ~3000 characters before
// "see more" — this is a rough, clearly-labeled heads-up, not an exact simulator.
const LONG_POST_THRESHOLD = 3000;

const FOOTER_ACTIONS = [
  { label: "Like", icon: ThumbsUp },
  { label: "Comment", icon: MessageCircle },
  { label: "Repost", icon: Repeat2 },
  { label: "Send", icon: Send },
];

/**
 * The LinkedIn post IS the editor: no separate Edit/Preview mode. Plain
 * text only (no Markdown), so a styled, auto-growing <textarea> is the
 * right tool here — unlike Article, there's no source/rendered-view split
 * to reconcile.
 */
export function LinkedInPostEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const charCount = content.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-xl rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-600">
            YN
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">Your Name</div>
            <div className="text-xs text-muted-foreground">1m</div>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={1}
          placeholder="Write your LinkedIn post..."
          className="mt-3 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed break-words text-foreground outline-none placeholder:text-muted-foreground"
        />

        <div className="mt-4 flex items-center justify-between border-t pt-2.5">
          {FOOTER_ACTIONS.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mx-auto w-full max-w-xl text-xs text-muted-foreground">
        {charCount.toLocaleString()} characters
        {charCount > LONG_POST_THRESHOLD
          ? " · long post — may get truncated behind \"see more\" (approximate)"
          : ""}
      </p>
    </div>
  );
}
