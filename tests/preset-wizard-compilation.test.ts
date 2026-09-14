import { describe, expect, it } from "vitest";
import { compilePresetSettingsInstructions } from "@/lib/writing-engine/compilePresetSettings";
import { composeDocumentGenerationPrompt, composeDocumentEditPrompt } from "@/lib/writing-engine/composePrompt";
import { defaultPresetSettings, type PresetSettings } from "@/lib/writing-engine/presetSettings";
import type { PresetSnapshot } from "@/lib/writing-engine/types";
import type { ProjectContext } from "@/lib/context/buildProjectContext";

const fakeContext: ProjectContext = {
  project: { id: "p1", user_id: "u1", owner_id: "u1", name: "Test Project", description: null, created_at: "", updated_at: "" },
  notes: [],
  notesText: "Some note content.",
  estimatedTokens: 10,
};

function snapshotWithSettings(): PresetSnapshot {
  const settings = {
    ...defaultPresetSettings("linkedin_post"),
    purpose: "Share practical opinions about online business.",
    audience: "Beginner sellers.",
    voice: ["direct", "conversational", "expert"] as PresetSettings["voice"],
  };
  return {
    presetId: "custom-1",
    source: "custom",
    name: "My Expert LinkedIn",
    documentType: "linkedin_post",
    version: 1,
    rules: ["Custom explicit rule."],
    avoidRules: ["Custom explicit avoid rule."],
    settings,
  };
}

describe("compilePresetSettingsInstructions", () => {
  it("produces PURPOSE/AUDIENCE/VOICE/STRUCTURE/LENGTH sections", () => {
    const snapshot = snapshotWithSettings();
    const compiled = compilePresetSettingsInstructions(snapshot.settings!, "linkedin_post");

    expect(compiled).toContain("PURPOSE:");
    expect(compiled).toContain("AUDIENCE:");
    expect(compiled).toContain("VOICE:");
    expect(compiled).toContain("STRUCTURE:");
    expect(compiled).toContain("LENGTH:");
    expect(compiled).toContain("direct, conversational, expert");
  });

  it("returns an empty string for a fully-default settings object with no purpose/audience/voice", () => {
    const settings = defaultPresetSettings("article");
    const compiled = compilePresetSettingsInstructions(settings, "article");
    // Structure/Length still say something (defaults are meaningful), but
    // purpose/audience/voice sections should be absent.
    expect(compiled).not.toContain("PURPOSE:");
    expect(compiled).not.toContain("AUDIENCE:");
    expect(compiled).not.toContain("VOICE:");
  });
});

describe("document generation and editing use questionnaire-derived preset instructions", () => {
  it("generation prompt includes the compiled settings when the preset snapshot has them", () => {
    const snapshot = snapshotWithSettings();
    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      instructions: "Write something.",
      presetSnapshot: snapshot,
      seoKeywords: null,
    });

    expect(system).toContain("Share practical opinions about online business.");
    expect(system).toContain("direct, conversational, expert");
    // Explicit Step-4 rules must still be present alongside the compiled settings.
    expect(system).toContain("Custom explicit rule.");
    expect(system).toContain("Custom explicit avoid rule.");
  });

  it("AI editing continues using the stored preset snapshot, including its settings", () => {
    const snapshot = snapshotWithSettings();
    const { system } = composeDocumentEditPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      currentContent: "Existing content.",
      creationInstructions: "",
      editInstruction: "Make it shorter.",
      presetSnapshot: snapshot,
      seoKeywords: null,
    });

    expect(system).toContain("Share practical opinions about online business.");
    expect(system).toContain("Custom explicit rule.");
  });

  it("built-in presets (no settings) generate exactly as before — no compiled settings section", () => {
    const snapshot: PresetSnapshot = {
      presetId: "linkedin-thought-leadership",
      source: "built_in",
      name: "Thought Leadership",
      documentType: "linkedin_post",
      version: 1,
      rules: ["Lead with a clear point of view."],
      avoidRules: [],
      settings: null,
    };

    const { system } = composeDocumentGenerationPrompt({
      context: fakeContext,
      documentType: "linkedin_post",
      instructions: "Write something.",
      presetSnapshot: snapshot,
      seoKeywords: null,
    });

    expect(system).toContain("WRITING PRESET: Thought Leadership");
    expect(system).toContain("Lead with a clear point of view.");
    expect(system).not.toContain("PURPOSE:");
  });
});
