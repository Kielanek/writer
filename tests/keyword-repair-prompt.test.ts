import { describe, expect, it } from "vitest";
import { composeKeywordRepairPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import { builtInPresetToResolved, buildPresetSnapshot } from "@/lib/writing-engine/snapshot";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", owner_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

const seoKeywords: SeoKeywordConfig = {
  primaryKeyword: "digital products on Etsy",
  secondaryKeywords: ["Etsy SEO", "Etsy product ideas"],
};

describe("composeKeywordRepairPrompt", () => {
  const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("article")));

  it("names exactly the missing keywords and instructs natural, minimal integration", () => {
    const { system, prompt } = composeKeywordRepairPrompt({
      documentType: "article",
      presetSnapshot,
      context: fakeContext,
      currentContent: "# Digital Products on Etsy\n\nSome existing content here.",
      seoKeywords,
      missingKeywords: ["Etsy product ideas"],
    });

    expect(system).toContain("Etsy product ideas");
    expect(system).toMatch(/currently missing from the article and must be added[\s\S]*etsy product ideas/i);
    expect(system).toMatch(/minimum changes|minimal/i);
    expect(prompt).toContain("Etsy product ideas");
    expect(prompt).toContain("Some existing content here.");
  });

  it("explicitly forbids appending a raw keyword list or a 'Keywords:' section", () => {
    const { system } = composeKeywordRepairPrompt({
      documentType: "article",
      presetSnapshot,
      context: fakeContext,
      currentContent: "# Digital Products on Etsy\n\nSome existing content here.",
      seoKeywords,
      missingKeywords: ["Etsy product ideas"],
    });

    expect(system.toLowerCase()).toContain("keywords: ...".toLowerCase());
    expect(system).toMatch(/do not add a new section, heading, or sentence/i);
  });

  it("instructs preserving headings and Markdown formatting", () => {
    const { system } = composeKeywordRepairPrompt({
      documentType: "article",
      presetSnapshot,
      context: fakeContext,
      currentContent: "# Digital Products on Etsy\n\nSome existing content here.",
      seoKeywords,
      missingKeywords: ["Etsy product ideas"],
    });

    expect(system).toMatch(/preserve the existing structure, headings, markdown formatting/i);
  });

  it("still includes the full SEO rules (both keywords), not just the missing one, for natural-placement context", () => {
    const { system } = composeKeywordRepairPrompt({
      documentType: "article",
      presetSnapshot,
      context: fakeContext,
      currentContent: "# Digital Products on Etsy\n\nSome existing content here.",
      seoKeywords,
      missingKeywords: ["Etsy product ideas"],
    });

    expect(system).toContain("SEO RULES");
    expect(system).toContain(seoKeywords.primaryKeyword);
  });
});
