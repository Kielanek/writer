import { SERP_DESKTOP } from "@/components/documents/seo/serp-config";

/**
 * Approximates a single desktop Google organic result — favicon, breadcrumb
 * URL, title, and a description snippet. Truncation uses Tailwind's
 * `line-clamp` against a fixed max-width, i.e. genuinely rendered/visual,
 * not a `slice(0, 60)` character cut — the same title can legitimately show
 * more or less of itself here than in the mobile preview, because the
 * available width differs, exactly like real Google search results.
 */
export function SerpDesktopPreview({
  title,
  description,
  siteName,
  breadcrumb,
}: {
  title: string;
  description: string;
  siteName: string;
  breadcrumb: string;
}) {
  return (
    <div className="w-full rounded-xl border bg-card p-4" style={{ maxWidth: SERP_DESKTOP.maxWidthPx }}>
      <div className="flex min-w-0 flex-col gap-1 font-sans">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
            {siteName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{breadcrumb}</span>
        </div>

        <div className={`${SERP_DESKTOP.titleClamp} break-words text-xl leading-snug text-blue-700`}>{title}</div>

        <p className={`${SERP_DESKTOP.descriptionClamp} break-words text-sm leading-relaxed text-muted-foreground`}>
          {description}
        </p>
      </div>
    </div>
  );
}
