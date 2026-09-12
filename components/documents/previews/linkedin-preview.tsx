import { MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { normalizeLinkedInText } from "@/lib/utils/normalizeLinkedInText";

// LinkedIn's own editor truncates posts around ~3000 characters before
// "see more" — this is a rough, clearly-labeled heads-up, not an exact simulator.
const LONG_POST_THRESHOLD = 3000;

const FOOTER_ACTIONS = [
  { label: "Like", icon: ThumbsUp },
  { label: "Comment", icon: MessageCircle },
  { label: "Repost", icon: Repeat2 },
  { label: "Send", icon: Send },
];

export function LinkedInPreview({ content }: { content: string }) {
  const displayText = normalizeLinkedInText(content);
  const charCount = displayText.length;

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

        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {displayText}
        </p>

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
