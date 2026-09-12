import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

import { getBuiltInPreset, getBuiltInPresets } from "@/lib/writing-engine/registry";
import {
  createPreset,
  deletePreset,
  duplicatePreset,
  resolvePreset,
  updatePreset,
} from "@/lib/writing-engine/customPresets/service";
import { ApiError } from "@/lib/utils/api";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
});

describe("built-in preset scoping", () => {
  it("only returns LinkedIn presets for linkedin_post", () => {
    const presets = getBuiltInPresets("linkedin_post");
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.documentType === "linkedin_post")).toBe(true);
  });

  it("only returns Article presets for article", () => {
    const presets = getBuiltInPresets("article");
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.documentType === "article")).toBe(true);
  });

  it("resolvePreset rejects a built-in preset id under the wrong document type", async () => {
    const linkedinPreset = getBuiltInPresets("linkedin_post")[0];
    const resolved = await resolvePreset("article", linkedinPreset.id);
    expect(resolved).toBeNull();
  });
});

describe("custom preset CRUD", () => {
  it("creates a custom preset scoped to one document type", async () => {
    const preset = await createPreset({
      documentType: "linkedin_post",
      name: "My LinkedIn Style",
      description: "Sales-focused",
      rules: ["Be direct", "  ", "Use short sentences"],
      avoidRules: ["Avoid jargon"],
    });

    expect(preset.document_type).toBe("linkedin_post");
    expect(preset.name).toBe("My LinkedIn Style");
    // blank rules are sanitized out
    expect(preset.rules).toEqual(["Be direct", "Use short sentences"]);
    expect(preset.avoid_rules).toEqual(["Avoid jargon"]);

    const resolved = await resolvePreset("linkedin_post", preset.id);
    expect(resolved?.source).toBe("custom");
    expect(resolved?.name).toBe("My LinkedIn Style");
  });

  it("edits a custom preset", async () => {
    const preset = await createPreset({
      documentType: "article",
      name: "Draft",
      description: null,
      rules: ["Rule 1"],
      avoidRules: [],
    });

    const updated = await updatePreset(preset.id, { name: "Final Name", rules: ["New rule"] });

    expect(updated.name).toBe("Final Name");
    expect(updated.rules).toEqual(["New rule"]);
  });

  it("deletes a custom preset", async () => {
    const preset = await createPreset({
      documentType: "summary",
      name: "Temp",
      description: null,
      rules: [],
      avoidRules: [],
    });

    await deletePreset(preset.id);

    const resolved = await resolvePreset("summary", preset.id);
    expect(resolved).toBeNull();
  });
});

describe("built-in preset immutability", () => {
  it("cannot be deleted (not a row in the custom presets table)", async () => {
    const builtIn = getBuiltInPresets("newsletter")[0];
    await expect(deletePreset(builtIn.id)).rejects.toThrow(ApiError);
  });

  it("cannot be edited (not a row in the custom presets table)", async () => {
    const builtIn = getBuiltInPresets("youtube_script")[0];
    await expect(updatePreset(builtIn.id, { name: "Hacked" })).rejects.toThrow(ApiError);
  });

  it("can be duplicated into a new custom preset", async () => {
    const builtIn = getBuiltInPresets("linkedin_post")[0];
    expect(getBuiltInPreset(builtIn.id)).not.toBeNull();

    const duplicated = await duplicatePreset({
      presetId: builtIn.id,
      documentType: "linkedin_post",
    });

    expect(duplicated.id).not.toBe(builtIn.id);
    expect(duplicated.document_type).toBe("linkedin_post");
    expect(duplicated.rules).toEqual(builtIn.rules);
    expect(duplicated.avoid_rules).toEqual(builtIn.avoidRules);
    expect(duplicated.name).toContain(builtIn.label);

    // The duplicate is now a real, editable custom preset.
    const resolved = await resolvePreset("linkedin_post", duplicated.id);
    expect(resolved?.source).toBe("custom");
    expect(resolved?.editable).toBe(true);
  });
});
