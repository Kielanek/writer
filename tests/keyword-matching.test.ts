import { describe, expect, it } from "vitest";
import { countKeywordOccurrences, getKeywordCoverage, getMissingKeywords } from "@/lib/utils/keywordMatching";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

describe("countKeywordOccurrences", () => {
  it("counts case-insensitive whole-phrase matches", () => {
    const text = "Etsy sellers love Etsy. Many ETSY shops start small.";
    expect(countKeywordOccurrences(text, "Etsy")).toBe(3);
  });

  it("does not match partial-word fragments inside a larger word", () => {
    const text = "Artisanal goods and artist supplies are different from art.";
    expect(countKeywordOccurrences(text, "art")).toBe(1);
  });

  it("matches multi-word phrases as whole occurrences", () => {
    const text = "Selling digital products on Etsy is popular. Digital Products On Etsy is a great niche.";
    expect(countKeywordOccurrences(text, "digital products on etsy")).toBe(2);
  });

  it("does not match the phrase when the words are not contiguous", () => {
    const text = "Digital products sold elsewhere are not the same as digital marketing products.";
    expect(countKeywordOccurrences(text, "digital products")).toBe(1);
  });

  it("matches correctly inside raw Markdown without being confused by syntax characters", () => {
    const text = "# Digital Products on Etsy\n\nThis is about **Etsy** shops and _digital products_ tips.";
    expect(countKeywordOccurrences(text, "Etsy")).toBe(2);
    expect(countKeywordOccurrences(text, "digital products")).toBe(2);
  });

  it("returns 0 for an empty or whitespace-only keyword", () => {
    expect(countKeywordOccurrences("Some text here.", "")).toBe(0);
    expect(countKeywordOccurrences("Some text here.", "   ")).toBe(0);
  });

  it("returns 0 when the keyword does not appear", () => {
    expect(countKeywordOccurrences("Some unrelated text.", "nonexistent phrase")).toBe(0);
  });
});

describe("getKeywordCoverage", () => {
  const seoKeywords: SeoKeywordConfig = {
    primaryKeyword: "digital products on Etsy",
    secondaryKeywords: ["Etsy SEO", "selling digital products", "Etsy product ideas"],
  };

  it("reports every keyword found when all are present", () => {
    const content = [
      "# Digital Products on Etsy: A Complete Guide",
      "",
      "Selling digital products on Etsy is a great way to earn passive income.",
      "Good Etsy SEO helps buyers find your shop.",
      "If you are selling digital products for the first time, start simple.",
      "Looking for Etsy product ideas? Start with printables.",
    ].join("\n\n");

    const coverage = getKeywordCoverage(content, seoKeywords);

    expect(coverage.primary.found).toBe(true);
    expect(coverage.primary.count).toBeGreaterThan(0);
    expect(coverage.secondary.every((entry) => entry.found)).toBe(true);
    expect(coverage.missingKeywords).toEqual([]);
  });

  it("lists every keyword that is missing, primary or secondary", () => {
    const content = "Digital products on Etsy are a great way to earn passive income.";

    const coverage = getKeywordCoverage(content, seoKeywords);

    expect(coverage.primary.found).toBe(true);
    expect(coverage.secondary.map((e) => e.found)).toEqual([false, false, false]);
    expect(coverage.missingKeywords).toEqual(seoKeywords.secondaryKeywords);
  });

  it("reports the primary keyword itself as missing when absent", () => {
    const content = "This article never mentions the target phrase at all.";
    const coverage = getKeywordCoverage(content, { primaryKeyword: "digital products on Etsy", secondaryKeywords: [] });

    expect(coverage.primary.found).toBe(false);
    expect(coverage.missingKeywords).toEqual(["digital products on Etsy"]);
  });

  it("matches case-insensitively for coverage purposes", () => {
    const content = "DIGITAL PRODUCTS ON ETSY are popular. etsy seo matters. Selling Digital Products drive sales.";
    const coverage = getKeywordCoverage(content, seoKeywords);

    expect(coverage.primary.found).toBe(true);
    expect(coverage.secondary[0].found).toBe(true); // Etsy SEO
    expect(coverage.secondary[1].found).toBe(true); // selling digital products
  });

  it("does not count an unrelated partial-word match as found", () => {
    const coverage = getKeywordCoverage(
      "Artisanal products are lovely but unrelated to the topic.",
      { primaryKeyword: "art", secondaryKeywords: [] }
    );
    expect(coverage.primary.found).toBe(false);
  });
});

describe("getMissingKeywords", () => {
  it("returns an empty array when nothing is missing", () => {
    const seoKeywords: SeoKeywordConfig = { primaryKeyword: "Etsy", secondaryKeywords: [] };
    expect(getMissingKeywords("Selling on Etsy is fun.", seoKeywords)).toEqual([]);
  });

  it("returns exactly the missing keywords, in order", () => {
    const seoKeywords: SeoKeywordConfig = {
      primaryKeyword: "Etsy",
      secondaryKeywords: ["printables", "digital downloads"],
    };
    expect(getMissingKeywords("Selling on Etsy is fun. Try printables.", seoKeywords)).toEqual([
      "digital downloads",
    ]);
  });
});
