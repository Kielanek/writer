import { SERP_PLACEHOLDER_SITE } from "@/components/documents/seo/serp-config";
import { normalizeForPreview, slugifyForPreview } from "@/components/documents/seo/serpText";
import { SerpDesktopPreview } from "@/components/documents/seo/serp-desktop-preview";
import { SerpMobilePreview } from "@/components/documents/seo/serp-mobile-preview";

/**
 * Renders an approximate Google organic search result — Desktop or Mobile.
 * Deliberately a plain visual approximation, not an "Exact Google Result":
 * Google may rewrite the title link or generate the snippet from page
 * content instead of the meta description, and real truncation depends on
 * device width and query context this preview can't know. No ads, ratings,
 * rich results, sitelinks, images, or Google branding — a standard organic
 * result block only.
 *
 * `siteName`/`domain` default to a centralized placeholder
 * (SERP_PLACEHOLDER_SITE) until this product has real per-Project website
 * settings to read instead — never hardcoded per call site.
 */
export function SerpPreview({
  title,
  description,
  path,
  siteName = SERP_PLACEHOLDER_SITE.siteName,
  domain = SERP_PLACEHOLDER_SITE.domain,
  device,
}: {
  title: string;
  description: string;
  path: string;
  siteName?: string;
  domain?: string;
  device: "desktop" | "mobile";
}) {
  const slug = slugifyForPreview(path);
  const breadcrumb = `${domain} › ${slug}`;
  const previewDescription = normalizeForPreview(description);

  if (device === "mobile") {
    return (
      <SerpMobilePreview title={title} description={previewDescription} siteName={siteName} domain={domain} breadcrumb={breadcrumb} />
    );
  }

  return <SerpDesktopPreview title={title} description={previewDescription} siteName={siteName} breadcrumb={breadcrumb} />;
}
