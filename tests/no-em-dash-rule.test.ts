import { describe, expect, it } from "vitest";
import { HARD_RULES } from "@/lib/writing-engine/rules/hardRules";
import { composeDocumentGenerationPrompt, composeDocumentEditPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import { buildPresetSnapshot, builtInPresetToResolved } from "@/lib/writing-engine/snapshot";
import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { DocumentType } from "@/types";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

const ALL_TYPES: DocumentType[] = ["linkedin_post", "article", "newsletter", "youtube_script", "summary"];

describe("global em dash ban", () => {
  it("is present as a hard rule", () => {
    expect(HARD_RULES.some((r) => r.includes("em dash"))).toBe(true);
  });

  it.each(ALL_TYPES)("is included in the %s generation prompt", (type) => {
    const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset(type)));
    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: type,
      instructions: "Write something.",
      presetSnapshot,
      seoKeywords: null,
    });

    expect(system).toContain("Never use the em dash character");
  });

  it.each(ALL_TYPES)("is included in the %s AI edit prompt", (type) => {
    const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset(type)));
    const { system } = composeDocumentEditPrompt({
      context: fakeContext,
      documentType: type,
      currentContent: "Some existing content.",
      creationInstructions: "",
      editInstruction: "Make it better.",
      presetSnapshot,
      seoKeywords: null,
    });

    expect(system).toContain("Never use the em dash character");
  });

  it("no built-in preset rule or avoid-rule string itself contains a literal em dash", async () => {
    for (const type of ALL_TYPES) {
      const { getBuiltInPresets } = await import("@/lib/writing-engine/registry");
      for (const preset of getBuiltInPresets(type)) {
        for (const rule of [...preset.rules, ...preset.avoidRules]) {
          expect(rule).not.toContain("—");
        }
      }
    }
  });
});
