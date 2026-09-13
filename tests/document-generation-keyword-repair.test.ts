import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(),
  AiGenerationError: class AiGenerationError extends Error {},
}));

import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import { generateDocumentContent, generateDocumentEdit } from "@/lib/ai/documentGeneration";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { PresetSnapshot } from "@/lib/writing-engine/types";
import type { SeoKeywordConfig } from "@/lib/writing-engine/seoKeywords";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

const presetSnapshot: PresetSnapshot = {
  presetId: "article-expert",
  source: "built_in",
  name: "Expert Article",
  documentType: "article",
  version: 1,
  rules: ["Write with authority."],
  avoidRules: [],
  settings: null,
};

const seoKeywords: SeoKeywordConfig = {
  primaryKeyword: "digital products on Etsy",
  secondaryKeywords: ["Etsy SEO", "Etsy product ideas"],
};

beforeEach(() => {
  vi.mocked(generateText).mockReset();
});

describe("generateDocumentContent — keyword coverage enforcement", () => {
  it("returns the content as-is, with a single generateText call, when every keyword is already present", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      "# Digital Products on Etsy\n\nEtsy SEO matters. Check out these Etsy product ideas."
    );

    const content = await generateDocumentContent({
      context: fakeContext,
      documentType: "article",
      instructions: "Write it.",
      presetSnapshot,
      seoKeywords,
    });

    expect(content).toContain("Etsy product ideas");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("runs exactly one repair pass when a keyword is missing, and returns the repaired content", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce("# Digital Products on Etsy\n\nEtsy SEO matters a lot.") // missing "Etsy product ideas"
      .mockResolvedValueOnce(
        "# Digital Products on Etsy\n\nEtsy SEO matters a lot. Looking for Etsy product ideas? Start here."
      );

    const content = await generateDocumentContent({
      context: fakeContext,
      documentType: "article",
      instructions: "Write it.",
      presetSnapshot,
      seoKeywords,
    });

    expect(content).toContain("Etsy product ideas");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does not loop: if the repair pass still misses a keyword, the repaired content is returned anyway", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce("# Digital Products on Etsy\n\nEtsy SEO matters a lot.")
      .mockResolvedValueOnce("# Digital Products on Etsy\n\nEtsy SEO matters a lot, still missing one term.");

    const content = await generateDocumentContent({
      context: fakeContext,
      documentType: "article",
      instructions: "Write it.",
      presetSnapshot,
      seoKeywords,
    });

    expect(content).toBe("# Digital Products on Etsy\n\nEtsy SEO matters a lot, still missing one term.");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to the original content if the repair pass itself fails, without throwing", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce("# Digital Products on Etsy\n\nEtsy SEO matters a lot.")
      .mockRejectedValueOnce(new AiGenerationError("model unavailable"));

    const content = await generateDocumentContent({
      context: fakeContext,
      documentType: "article",
      instructions: "Write it.",
      presetSnapshot,
      seoKeywords,
    });

    expect(content).toBe("# Digital Products on Etsy\n\nEtsy SEO matters a lot.");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("skips coverage checking entirely when seoKeywords is null (legacy Article)", async () => {
    vi.mocked(generateText).mockResolvedValueOnce("Some content with no keywords at all.");

    const content = await generateDocumentContent({
      context: fakeContext,
      documentType: "article",
      instructions: "Write it.",
      presetSnapshot,
      seoKeywords: null,
    });

    expect(content).toBe("Some content with no keywords at all.");
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

describe("generateDocumentEdit — keyword coverage enforcement", () => {
  it("repairs a keyword accidentally dropped by an AI edit before returning", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce("# Digital Products on Etsy\n\nShorter now, Etsy SEO gone.") // AI edit dropped keywords
      .mockResolvedValueOnce(
        "# Digital Products on Etsy\n\nShorter now. Etsy SEO and Etsy product ideas both included."
      );

    const content = await generateDocumentEdit({
      context: fakeContext,
      documentType: "article",
      currentContent: "# Digital Products on Etsy\n\nEtsy SEO matters. Etsy product ideas too.",
      creationInstructions: "",
      editInstruction: "Shorten this by 30%.",
      presetSnapshot,
      seoKeywords,
    });

    expect(content).toContain("Etsy SEO");
    expect(content).toContain("Etsy product ideas");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does not run a repair pass when the edited content already keeps every keyword", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      "# Digital Products on Etsy\n\nEtsy SEO matters. Etsy product ideas too, still here."
    );

    await generateDocumentEdit({
      context: fakeContext,
      documentType: "article",
      currentContent: "# Digital Products on Etsy\n\nEtsy SEO matters. Etsy product ideas too.",
      creationInstructions: "",
      editInstruction: "Fix a typo.",
      presetSnapshot,
      seoKeywords,
    });

    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
