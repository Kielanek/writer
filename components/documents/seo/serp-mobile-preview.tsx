import { SERP_MOBILE } from "@/components/documents/seo/serp-config";

/**
 * A CSS-only phone mockup (dark bezel + notch) around a narrower SERP card —
 * deliberately its own layout, not the desktop card scaled down: narrower
 * max-width, a two-line title allowance (mobile Google results commonly wrap
 * to 2 lines instead of desktop's single truncated line), and a taller
 * description clamp since less text fits per line at this width.
 */
export function SerpMobilePreview({
  title,
  description,
  siteName,
  domain,
  breadcrumb,
}: {
  title: string;
  description: string;
  siteName: string;
  domain: string;
  breadcrumb: string;
}) {
  return (
    <div
      className="mx-auto w-full rounded-[2.25rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-lg"
      style={{ maxWidth: SERP_MOBILE.maxWidthPx }}
    >
      <div className="relative overflow-hidden rounded-[1.5rem] bg-card">
        <div className="absolute top-0 left-1/2 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-neutral-900" aria-hidden />
        <div className="flex min-w-0 flex-col gap-2 px-4 pt-8 pb-5 font-sans">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {siteName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-medium text-foreground">{domain}</div>
              <div className="truncate text-[11px] text-muted-foreground">{breadcrumb}</div>
            </div>
          </div>

          <div className={`${SERP_MOBILE.titleClamp} break-words text-base leading-snug text-blue-700`}>{title}</div>

          <p className={`${SERP_MOBILE.descriptionClamp} break-words text-[13px] leading-relaxed text-muted-foreground`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
