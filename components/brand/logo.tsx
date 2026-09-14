import { Mic } from "lucide-react";
import { cn } from "cn";

/**
 * The app's mark: a simple black square with a white mic glyph. Deliberately
 * two-tone (no brand color) — used both in the site header and as the
 * LinkedIn preview's avatar photo, so both stay in sync if the mark ever
 * changes.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white",
        className
      )}
    >
      <Mic className="size-[60%]" strokeWidth={2.25} />
    </span>
  );
}
