import { describe, expect, it } from "vitest";
import { composeDocumentGenerationPrompt, composeDocumentEditPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import { buildPresetSnapshot, builtInPresetToResolved } from "@/lib/writing-engine/snapshot";
import { normalizeLinkedInText } from "@/lib/utils/normalizeLinkedInText";
import type { ProjectContext } from "@/lib/context/buildProjectContext";

const fakeContext: ProjectContext = {
  project: { id: "p1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

const linkedinPreset = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("linkedin_post")));
const articlePreset = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("article")));

describe("LinkedIn generation prompt forbids Markdown", () => {
  it("instructs the model not to use Markdown headings or bold syntax", () => {
    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      instructions: "Write a post.",
      presetSnapshot: linkedinPreset,
      seoKeywords: null,
    });

    expect(system).toMatch(/do not use markdown/i);
    expect(system).toContain("'#', '##', or '###' headings");
    expect(system).toContain("**bold**");
  });

  it("does NOT apply LinkedIn's plain-text restriction to Article generation", () => {
    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "article",
      instructions: "Write an article.",
      presetSnapshot: articlePreset,
      seoKeywords: null,
    });

    expect(system).not.toContain("LINKEDIN OUTPUT FORMAT");
    expect(system).toMatch(/use clean markdown/i);
  });
});

describe("LinkedIn AI edit prompt preserves the plain-text format rule", () => {
  it("still forbids Markdown when editing an existing LinkedIn post", () => {
    const { system } = composeDocumentEditPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      currentContent: "Some existing plain-text post.",
      creationInstructions: "",
      editInstruction: "Make it shorter.",
      presetSnapshot: linkedinPreset,
      seoKeywords: null,
    });

    expect(system).toMatch(/do not use markdown/i);
    expect(system).toContain("**bold**");
  });

  it("still allows Markdown when editing an existing Article", () => {
    const { system } = composeDocumentEditPrompt({
      context: fakeContext,
      documentType: "article",
      currentContent: "## Some heading\n\nSome body text.",
      creationInstructions: "",
      editInstruction: "Tighten the intro.",
      presetSnapshot: articlePreset,
      seoKeywords: null,
    });

    expect(system).toMatch(/use clean markdown/i);
  });
});

describe("normalizeLinkedInText", () => {
  it("strips accidental Markdown heading and bold/italic markers", () => {
    const input = "## Big Announcement\n\nThis is **very** important, and _really_ true.";
    const result = normalizeLinkedInText(input);

    expect(result).not.toContain("#");
    expect(result).not.toContain("**");
    expect(result).not.toContain("_");
    expect(result).toContain("Big Announcement");
    expect(result).toContain("This is very important, and really true.");
  });

  it("strips markdown separators and code fences", () => {
    const input = "Line one.\n---\n```\nLine two.\n```";
    const result = normalizeLinkedInText(input);

    expect(result).not.toContain("---");
    expect(result).not.toContain("```");
    expect(result).toContain("Line one.");
    expect(result).toContain("Line two.");
  });

  it("preserves exact paragraph breaks", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const result = normalizeLinkedInText(input);

    expect(result).toBe(input); // nothing here needed stripping — must be untouched
    expect(result.split("\n\n")).toHaveLength(3);
  });

  it("leaves already-clean plain text completely unchanged", () => {
    const input = "A clean LinkedIn post with no Markdown at all.\n\nJust normal paragraphs.";
    expect(normalizeLinkedInText(input)).toBe(input);
  });
});
