import { describe, expect, it } from "vitest";
import { composeDocumentEditPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { PresetSnapshot } from "@/lib/writing-engine/types";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

describe("AI document editing preserves the Document's original preset", () => {
  it("includes the Document's custom preset rules in the edit prompt, not the generic default", () => {
    const customSnapshot: PresetSnapshot = {
      presetId: "custom-id-123",
      source: "custom",
      name: "My LinkedIn Style",
      documentType: "linkedin_post",
      version: 1,
      rules: ["UNIQUE_MARKER_RULE: always open with a bold claim."],
      avoidRules: ["UNIQUE_MARKER_AVOID: never use hashtags."],
    };

    const { system } = composeDocumentEditPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      currentContent: "Existing document content.",
      creationInstructions: "",
      editInstruction: "Make it shorter.",
      presetSnapshot: customSnapshot,
      seoKeywords: null,
    });

    expect(system).toContain("My LinkedIn Style");
    expect(system).toContain("UNIQUE_MARKER_RULE");
    expect(system).toContain("UNIQUE_MARKER_AVOID");

    // Must not silently fall back to the default built-in preset's rules.
    const defaultPreset = getDefaultBuiltInPreset("linkedin_post");
    for (const rule of defaultPreset.rules) {
      expect(system).not.toContain(rule);
    }
  });
});
