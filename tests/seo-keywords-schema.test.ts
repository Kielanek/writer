import { describe, expect, it } from "vitest";
import { seoKeywordConfigSchema, resolveDocumentSeoConfig, MAX_SECONDARY_KEYWORDS } from "@/lib/writing-engine/seoKeywords";

describe("seoKeywordConfigSchema", () => {
  it("accepts a primary keyword with no secondary keywords", () => {
    const result = seoKeywordConfigSchema.safeParse({ primaryKeyword: "digital products on Etsy" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.secondaryKeywords).toEqual([]);
  });

  it("rejects a missing or empty primary keyword", () => {
    expect(seoKeywordConfigSchema.safeParse({}).success).toBe(false);
    expect(seoKeywordConfigSchema.safeParse({ primaryKeyword: "" }).success).toBe(false);
    expect(seoKeywordConfigSchema.safeParse({ primaryKeyword: "   " }).success).toBe(false);
  });

  it("trims whitespace on primary and secondary keywords", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "  digital products  ",
      secondaryKeywords: ["  Etsy SEO  "],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primaryKeyword).toBe("digital products");
      expect(result.data.secondaryKeywords).toEqual(["Etsy SEO"]);
    }
  });

  it("rejects duplicate secondary keywords (case-insensitive)", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "digital products",
      secondaryKeywords: ["Etsy SEO", "etsy seo"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a secondary keyword that duplicates the primary keyword", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "Etsy SEO",
      secondaryKeywords: ["etsy seo"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty secondary keyword", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "digital products",
      secondaryKeywords: ["Etsy SEO", "  "],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_SECONDARY_KEYWORDS} secondary keywords`, () => {
    const secondaryKeywords = Array.from({ length: MAX_SECONDARY_KEYWORDS + 1 }, (_, i) => `keyword ${i}`);
    const result = seoKeywordConfigSchema.safeParse({ primaryKeyword: "digital products", secondaryKeywords });
    expect(result.success).toBe(false);
  });

  it("accepts exactly the maximum number of secondary keywords", () => {
    const secondaryKeywords = Array.from({ length: MAX_SECONDARY_KEYWORDS }, (_, i) => `keyword ${i}`);
    const result = seoKeywordConfigSchema.safeParse({ primaryKeyword: "digital products", secondaryKeywords });
    expect(result.success).toBe(true);
  });

  it("rejects a keyword over the per-keyword character limit", () => {
    const result = seoKeywordConfigSchema.safeParse({ primaryKeyword: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("resolveDocumentSeoConfig", () => {
  it("returns null for a Document with no seo_settings", () => {
    expect(resolveDocumentSeoConfig({ seo_settings: null })).toBeNull();
  });

  it("returns null for malformed seo_settings instead of throwing", () => {
    expect(resolveDocumentSeoConfig({ seo_settings: "not an object" })).toBeNull();
    expect(resolveDocumentSeoConfig({ seo_settings: { primaryKeyword: "" } })).toBeNull();
    expect(resolveDocumentSeoConfig({ seo_settings: [] })).toBeNull();
  });

  it("returns the parsed config for valid seo_settings", () => {
    const config = resolveDocumentSeoConfig({
      seo_settings: { primaryKeyword: "digital products on Etsy", secondaryKeywords: ["Etsy SEO"] },
    });
    expect(config).toEqual({ primaryKeyword: "digital products on Etsy", secondaryKeywords: ["Etsy SEO"] });
  });
});
