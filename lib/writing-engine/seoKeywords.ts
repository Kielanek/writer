import { z } from "zod";

/**
 * SEO keyword configuration for an `article` Document — every Article is
 * SEO-focused, so this is mandatory for every newly created one. Deliberately
 * separate from Writing Presets (lib/writing-engine/presetSettings.ts) — a
 * preset defines HOW to write; this defines WHAT keywords a specific
 * document targets. Never store keywords on a preset.
 */

export const seoKeywordSchema = z.string().trim().min(1, "Keyword cannot be empty").max(100, "Keyword is too long");

export const MAX_SECONDARY_KEYWORDS = 10;

export const seoKeywordConfigSchema = z
  .object({
    primaryKeyword: seoKeywordSchema,
    secondaryKeywords: z.array(seoKeywordSchema).max(MAX_SECONDARY_KEYWORDS).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const keyword of value.secondaryKeywords) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate secondary keyword: "${keyword}"`,
          path: ["secondaryKeywords"],
        });
      }
      seen.add(key);
    }
    if (value.secondaryKeywords.some((k) => k.toLowerCase() === value.primaryKeyword.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Secondary keywords must be different from the primary keyword.",
        path: ["secondaryKeywords"],
      });
    }
  });

export type SeoKeywordConfig = z.infer<typeof seoKeywordConfigSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves a Document's frozen SEO configuration, tolerating anything that
 * isn't a valid config (null, missing, malformed) by returning null rather
 * than throwing — seo_settings is absent for every non-Article Document,
 * and for legacy Articles created before SEO keywords were mandatory (the
 * same defensive pattern used for preset snapshots elsewhere in the Writing
 * Engine applies here too).
 */
export function resolveDocumentSeoConfig(document: { seo_settings: unknown }): SeoKeywordConfig | null {
  if (!isPlainObject(document.seo_settings)) return null;
  const result = seoKeywordConfigSchema.safeParse(document.seo_settings);
  return result.success ? result.data : null;
}
