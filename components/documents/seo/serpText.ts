/** Collapses newlines/repeated whitespace for the PREVIEW only — never mutates the stored Meta Description. */
export function normalizeForPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function slugifyForPreview(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "article";
}
