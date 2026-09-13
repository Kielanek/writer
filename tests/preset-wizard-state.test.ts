import { describe, expect, it } from "vitest";
import {
  wizardStateFromCustomPreset,
  wizardStateFromBuiltInPreset,
  wizardStateFromDuplicatedCustomPreset,
  emptyWizardState,
} from "@/components/presets/wizard/wizard-types";
import { defaultPresetSettings } from "@/lib/writing-engine/presetSettings";
import type { CustomPresetRecord, BuiltInPreset } from "@/lib/writing-engine/types";

describe("wizard prefill from an existing custom preset (edit flow)", () => {
  it("carries over name, description, settings, rules, and avoid rules", () => {
    const settings = { ...defaultPresetSettings("article"), purpose: "Explain things clearly." };
    const preset: CustomPresetRecord = {
      id: "p1",
      user_id: "u1",
      document_type: "article",
      name: "My Article Style",
      description: "For blog posts",
      rules: ["Rule one"],
      avoid_rules: ["Avoid one"],
      settings,
      created_at: "",
      updated_at: "",
    };

    const state = wizardStateFromCustomPreset(preset, "article");

    expect(state.name).toBe("My Article Style");
    expect(state.description).toBe("For blog posts");
    expect(state.settings.purpose).toBe("Explain things clearly.");
    expect(state.rules).toEqual(["Rule one"]);
    expect(state.avoidRules).toEqual(["Avoid one"]);
  });

  it("falls back to default settings when the preset predates the questionnaire (settings is null)", () => {
    const preset: CustomPresetRecord = {
      id: "p2",
      user_id: "u1",
      document_type: "summary",
      name: "Old Style Preset",
      description: null,
      rules: ["Old rule"],
      avoid_rules: [],
      settings: null,
      created_at: "",
      updated_at: "",
    };

    const state = wizardStateFromCustomPreset(preset, "summary");
    expect(state.rules).toEqual(["Old rule"]);
    expect(state.settings.typeSpecific.documentType).toBe("summary");
  });
});

describe("Duplicate & Customize prefill", () => {
  it("built-in preset duplication copies rules/avoidRules and defaults the rest (no settings to map)", () => {
    const builtIn: BuiltInPreset = {
      id: "linkedin-thought-leadership",
      documentType: "linkedin_post",
      label: "Thought Leadership",
      description: "A confident take.",
      rules: ["Lead with a clear point of view."],
      avoidRules: ["Avoid hedging."],
      version: 1,
      isDefault: true,
    };

    const state = wizardStateFromBuiltInPreset(builtIn);

    expect(state.name).toBe("Thought Leadership (Copy)");
    expect(state.rules).toEqual(["Lead with a clear point of view."]);
    expect(state.avoidRules).toEqual(["Avoid hedging."]);
    expect(state.settings.voice).toEqual([]); // sensible defaults, not guessed
    expect(state.settings.typeSpecific.documentType).toBe("linkedin_post");
  });

  it("custom preset duplication also carries the source's settings forward", () => {
    const settings = { ...defaultPresetSettings("newsletter"), audience: "Existing subscribers." };
    const preset: CustomPresetRecord = {
      id: "p3",
      user_id: "u1",
      document_type: "newsletter",
      name: "My Newsletter Voice",
      description: null,
      rules: [],
      avoid_rules: [],
      settings,
      created_at: "",
      updated_at: "",
    };

    const state = wizardStateFromDuplicatedCustomPreset(preset, "newsletter");
    expect(state.name).toBe("My Newsletter Voice (Copy)");
    expect(state.settings.audience).toBe("Existing subscribers.");
  });
});

describe("emptyWizardState", () => {
  it("starts with no name and type-appropriate default settings", () => {
    const state = emptyWizardState("youtube_script");
    expect(state.name).toBe("");
    expect(state.rules).toEqual([]);
    expect(state.settings.typeSpecific.documentType).toBe("youtube_script");
    expect(state.settings.length.unit).toBe("minutes");
  });
});
