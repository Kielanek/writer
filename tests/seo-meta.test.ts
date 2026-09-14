import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(),
  AiGenerationError: class AiGenerationError extends Error {},
}));
vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeDb,
}));

import { generateText } from "@/lib/ai/generateText";
import { generateDocumentMeta } from "@/lib/ai/documentGeneration";
import { buildDocumentMetaPrompt, parseDocumentMetaResponse } from "@/lib/ai/prompts/documentMeta";
import { seoKeywordConfigSchema, resolveDocumentSeoConfig } from "@/lib/writing-engine/seoKeywords";
import { createDocumentVersion, getDocumentVersion } from "@/lib/db/documents";
import {
  classifyLength,
  SERP_TITLE_GUIDANCE,
  SERP_DESCRIPTION_GUIDANCE,
} from "@/components/documents/seo/serp-config";
import { normalizeForPreview, slugifyForPreview } from "@/components/documents/seo/serpText";
import { countKeywordOccurrences } from "@/lib/utils/keywordMatching";

function textResult(text: string) {
  return { text, usage: null };
}

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.currentUserId = FAKE_USER_ID;
});

// --- 1-4: seo_settings schema now carries metaTitle/metaDescription -------

describe("seoKeywordConfigSchema", () => {
  it("1) accepts a config with no meta fields at all (legacy Articles)", () => {
    const result = seoKeywordConfigSchema.safeParse({ primaryKeyword: "etsy seo", secondaryKeywords: [] });
    expect(result.success).toBe(true);
  });

  it("2) accepts metaTitle/metaDescription alongside keywords", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "etsy seo",
      secondaryKeywords: ["etsy tips"],
      metaTitle: "Etsy SEO: 5 Tips That Work",
      metaDescription: "Learn how to rank higher on Etsy with these five proven SEO tips for sellers.",
    });
    expect(result.success).toBe(true);
  });

  it("3) rejects a pathologically long metaTitle/metaDescription rather than silently truncating", () => {
    const result = seoKeywordConfigSchema.safeParse({
      primaryKeyword: "etsy seo",
      secondaryKeywords: [],
      metaTitle: "x".repeat(400),
    });
    expect(result.success).toBe(false);
  });

  it("4) resolveDocumentSeoConfig tolerates a legacy Article with no seo_settings at all", () => {
    expect(resolveDocumentSeoConfig({ seo_settings: null })).toBeNull();
    expect(resolveDocumentSeoConfig({ seo_settings: undefined })).toBeNull();
  });
});

// --- 5-7: prompt building / response parsing (structured JSON only) -------

describe("buildDocumentMetaPrompt / parseDocumentMetaResponse", () => {
  it("5) includes the primary keyword, title, and content in the prompt", () => {
    const { system, prompt } = buildDocumentMetaPrompt({
      title: "Etsy Guide",
      content: "Full article body here.",
      primaryKeyword: "etsy seo",
    });
    expect(system).toContain("JSON");
    expect(system).not.toMatch(/Title:\s*\.\.\./); // never asks for free-form "Title: ..." prose
    expect(prompt).toContain("etsy seo");
    expect(prompt).toContain("Etsy Guide");
    expect(prompt).toContain("Full article body here.");
  });

  it("6) parses a clean JSON response", () => {
    const parsed = parseDocumentMetaResponse('{"metaTitle": "Etsy SEO Guide", "metaDescription": "Learn Etsy SEO fast."}');
    expect(parsed).toEqual({ metaTitle: "Etsy SEO Guide", metaDescription: "Learn Etsy SEO fast." });
  });

  it("7) tolerates markdown code-fence noise around the JSON", () => {
    const raw = '```json\n{"metaTitle": "A", "metaDescription": "B"}\n```';
    expect(parseDocumentMetaResponse(raw)).toEqual({ metaTitle: "A", metaDescription: "B" });
  });

  it("throws rather than silently accepting free-form prose like \"Title: ...\"", () => {
    expect(() => parseDocumentMetaResponse("Title: Etsy SEO Guide\nDescription: Learn Etsy SEO fast.")).toThrow();
  });
});

// --- 8-9: generateDocumentMeta (mocked model call) --------------------------

describe("generateDocumentMeta", () => {
  it("8) returns the parsed metaTitle/metaDescription from the model", async () => {
    vi.mocked(generateText).mockResolvedValue(
      textResult('{"metaTitle": "Etsy SEO Guide", "metaDescription": "Learn Etsy SEO fast."}')
    );
    const result = await generateDocumentMeta({
      title: "Etsy Guide",
      content: "Article body",
      primaryKeyword: "etsy seo",
    });
    expect(result).toEqual({ metaTitle: "Etsy SEO Guide", metaDescription: "Learn Etsy SEO fast." });
  });

  it("9) works without a primary keyword (non-mandatory input)", async () => {
    vi.mocked(generateText).mockResolvedValue(textResult('{"metaTitle": "A Guide", "metaDescription": "A summary."}'));
    const result = await generateDocumentMeta({ title: "A Guide", content: "Body" });
    expect(result.metaTitle).toBe("A Guide");
  });
});

// --- 10-15: soft length guidance is NOT a Google limit claim ---------------

describe("classifyLength (soft editorial guidance only)", () => {
  it("10) short title/description classify as 'good'", () => {
    expect(classifyLength(40, SERP_TITLE_GUIDANCE)).toBe("good");
    expect(classifyLength(100, SERP_DESCRIPTION_GUIDANCE)).toBe("good");
  });

  it("11) title just past the concise threshold classifies as 'long', not 'invalid'", () => {
    expect(classifyLength(65, SERP_TITLE_GUIDANCE)).toBe("long");
  });

  it("12) title well past the long threshold classifies as 'very-long'", () => {
    expect(classifyLength(90, SERP_TITLE_GUIDANCE)).toBe("very-long");
  });

  it("13) description guidance uses its own (larger) thresholds than title", () => {
    expect(classifyLength(150, SERP_DESCRIPTION_GUIDANCE)).toBe("good");
    expect(classifyLength(165, SERP_DESCRIPTION_GUIDANCE)).toBe("long");
    expect(classifyLength(200, SERP_DESCRIPTION_GUIDANCE)).toBe("very-long");
  });

  it("14) there is no 'invalid' state — only good/long/very-long", () => {
    const states = [classifyLength(0, SERP_TITLE_GUIDANCE), classifyLength(1000, SERP_TITLE_GUIDANCE)];
    for (const s of states) expect(["good", "long", "very-long"]).toContain(s);
  });

  it("15) guidance constants are not framed as strict limits in code (structural sanity check on the exported shape)", () => {
    expect(SERP_TITLE_GUIDANCE).toEqual({ concise: 60, long: 70 });
    expect(SERP_DESCRIPTION_GUIDANCE).toEqual({ concise: 160, long: 170 });
  });
});

// --- 16-18: preview text helpers never mutate stored content ---------------

describe("Preview-only text normalization", () => {
  it("16) normalizeForPreview collapses newlines/extra whitespace without mutating the original string", () => {
    const raw = "Line one\nLine two   with   extra space";
    const normalized = normalizeForPreview(raw);
    expect(normalized).toBe("Line one Line two with extra space");
    expect(raw).toBe("Line one\nLine two   with   extra space"); // original untouched
  });

  it("17) slugifyForPreview produces a URL-safe path segment", () => {
    expect(slugifyForPreview("5 Mistakes Etsy Sellers Make!")).toBe("5-mistakes-etsy-sellers-make");
  });

  it("18) slugifyForPreview never returns an empty string", () => {
    expect(slugifyForPreview("")).toBe("article");
    expect(slugifyForPreview("!!!")).toBe("article");
  });
});

// --- 19-20: primary keyword status uses the SAME matching utility as the rest of the app --

describe("Keyword status reuses the centralized matcher", () => {
  it("19) detects the primary keyword inside a meta title", () => {
    expect(countKeywordOccurrences("Etsy SEO: 5 Tips That Work", "etsy seo")).toBeGreaterThan(0);
  });

  it("20) reports missing when the keyword isn't present, without blocking anything (guidance only, not enforced here)", () => {
    expect(countKeywordOccurrences("A Guide to Selling Online", "etsy seo")).toBe(0);
  });
});

// --- 21-23: version history snapshots seo_settings alongside content -------

describe("Document versions snapshot seo_settings (fake DB layer)", () => {
  beforeEach(() => {
    fakeDb.tables["documents"] = [
      {
        id: "doc-1",
        user_id: FAKE_USER_ID,
        project_id: "proj-1",
        type: "article",
        title: "Article",
        content: "v1 content",
        seo_settings: { primaryKeyword: "etsy seo", secondaryKeywords: [] },
      },
    ];
  });

  it("21) a version created with seoSettings stores it on the version row", async () => {
    const seoSettings = { primaryKeyword: "etsy seo", secondaryKeywords: [], metaTitle: "Etsy SEO Guide" };
    const version = await createDocumentVersion({
      documentId: "doc-1",
      content: "v2 content",
      source: "manual",
      seoSettings,
    });
    expect(version.seo_settings).toEqual(seoSettings);
  });

  it("22) creating a version with seoSettings also updates the live document's seo_settings", async () => {
    const seoSettings = { primaryKeyword: "etsy seo", secondaryKeywords: [], metaTitle: "New Title" };
    await createDocumentVersion({ documentId: "doc-1", content: "v2", source: "manual", seoSettings });
    const doc = fakeDb.tables["documents"].find((d) => d.id === "doc-1")!;
    expect(doc.seo_settings).toEqual(seoSettings);
  });

  it("23) restoring an older version's seo_settings is retrievable via getDocumentVersion, so restore can bring it back", async () => {
    const oldSeo = { primaryKeyword: "old keyword", secondaryKeywords: [], metaTitle: "Old Title" };
    const v2 = await createDocumentVersion({ documentId: "doc-1", content: "v2", source: "manual", seoSettings: oldSeo });

    // Simulate a later edit that changes seo_settings again.
    await createDocumentVersion({
      documentId: "doc-1",
      content: "v3",
      source: "manual",
      seoSettings: { primaryKeyword: "new keyword", secondaryKeywords: [] },
    });

    const fetchedV2 = await getDocumentVersion("doc-1", v2.version_number);
    expect(fetchedV2?.seo_settings).toEqual(oldSeo);
  });
});
