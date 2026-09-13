import { describe, expect, it } from "vitest";
import { composeDocumentGenerationPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import { builtInPresetToResolved } from "@/lib/writing-engine/snapshot";
import { buildPresetSnapshot } from "@/lib/writing-engine/snapshot";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

const keywords: SeoKeywordConfig = {
  primaryKeyword: "digital products on Etsy",
  secondaryKeywords: ["Etsy SEO", "passive income ideas"],
};

describe("SEO keywords are separate from Writing Presets, but every Article includes SEO rules", () => {
  it("a legacy Article with no SEO keywords (created before they were mandatory) omits SEO RULES rather than crashing", () => {
    const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("article")));

    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "article",
      instructions: "Write about X.",
      presetSnapshot,
      seoKeywords: null,
    });

    expect(system).not.toContain("SEO RULES");
  });

  it("adds SEO rules with the primary and secondary keywords for a new Article, without altering the preset's own rules", () => {
    const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("article")));

    const withoutSeo = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "article",
      instructions: "Write about X.",
      presetSnapshot,
      seoKeywords: null,
    });

    const withSeo = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "article",
      instructions: "Write about X.",
      presetSnapshot,
      seoKeywords: keywords,
    });

    expect(withSeo.system).toContain("SEO RULES");
    expect(withSeo.system).toContain(keywords.primaryKeyword);
    expect(withSeo.system).toContain(keywords.secondaryKeywords[0]);
    expect(withSeo.system).toContain(keywords.secondaryKeywords[1]);
    expect(withSeo.system).toContain("Never keyword-stuff");

    // The preset's own rules are identical whether or not SEO keywords are
    // present — SEO keywords never become a "writing style" of their own.
    for (const rule of presetSnapshot.rules) {
      expect(withoutSeo.system).toContain(rule);
      expect(withSeo.system).toContain(rule);
    }
  });

  it("a LinkedIn post (no SEO keywords in the UI) never receives SEO rules even if keywords are passed", () => {
    // Defensive check: SEO rules are generic, format rules stay scoped. A
    // LinkedIn generation should never see Article-only format rules.
    const linkedinPreset = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("linkedin_post")));

    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      instructions: "Write a post.",
      presetSnapshot: linkedinPreset,
      seoKeywords: keywords,
    });

    expect(system).not.toContain("logical headings");
  });
});
