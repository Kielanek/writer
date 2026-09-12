import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

import { createDocument, getDocument } from "@/lib/db/documents";
import { createPreset, deletePreset, resolvePreset, updatePreset } from "@/lib/writing-engine/customPresets/service";
import { buildPresetSnapshot, builtInPresetToResolved, resolveDocumentPresetSnapshot } from "@/lib/writing-engine/snapshot";
import { WRITING_ENGINE_VERSION } from "@/lib/writing-engine/version";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";

const PROJECT_ID = "77777777-7777-7777-7777-777777777777";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
});

describe("Document generation stores a preset snapshot", () => {
  it("persists the frozen preset rules on the Document row", async () => {
    const customPreset = await createPreset({
      documentType: "linkedin_post",
      name: "My LinkedIn Style",
      description: "Custom",
      rules: ["Always open with a number."],
      avoidRules: ["Never use emoji."],
    });

    const resolved = await resolvePreset("linkedin_post", customPreset.id);
    const snapshot = buildPresetSnapshot(resolved!);

    const document = await createDocument({
      projectId: PROJECT_ID,
      type: "linkedin_post",
      title: "LinkedIn Post",
      creationInstructions: "",
      content: "Generated content",
      presetId: customPreset.id,
      presetSnapshot: snapshot,
      writingEngineVersion: WRITING_ENGINE_VERSION,
      seoSettings: null,
    });

    expect(document.preset_id).toBe(customPreset.id);
    expect(document.preset_snapshot).toEqual(snapshot);
    expect((document.preset_snapshot as typeof snapshot).rules).toContain(
      "Always open with a number."
    );
    expect(document.writing_engine_version).toBe(WRITING_ENGINE_VERSION);
  });
});

describe("Preset snapshots are frozen at generation time", () => {
  it("editing a preset later does not change an existing Document's snapshot", async () => {
    const customPreset = await createPreset({
      documentType: "article",
      name: "Original Name",
      description: null,
      rules: ["Original rule"],
      avoidRules: [],
    });

    const resolved = await resolvePreset("article", customPreset.id);
    const snapshot = buildPresetSnapshot(resolved!);

    const document = await createDocument({
      projectId: PROJECT_ID,
      type: "article",
      title: "Article",
      creationInstructions: "",
      content: "content",
      presetId: customPreset.id,
      presetSnapshot: snapshot,
      writingEngineVersion: WRITING_ENGINE_VERSION,
      seoSettings: null,
    });

    await updatePreset(customPreset.id, { name: "Changed Name", rules: ["Totally different rule"] });

    const reloaded = await getDocument(document.id);
    const reloadedSnapshot = reloaded!.preset_snapshot as typeof snapshot;

    expect(reloadedSnapshot.name).toBe("Original Name");
    expect(reloadedSnapshot.rules).toEqual(["Original rule"]);
  });

  it("deleting a custom preset does not break the Document that used it", async () => {
    const customPreset = await createPreset({
      documentType: "summary",
      name: "Soon Deleted",
      description: null,
      rules: ["Keep it short"],
      avoidRules: [],
    });

    const resolved = await resolvePreset("summary", customPreset.id);
    const snapshot = buildPresetSnapshot(resolved!);

    const document = await createDocument({
      projectId: PROJECT_ID,
      type: "summary",
      title: "Summary",
      creationInstructions: "",
      content: "content",
      presetId: customPreset.id,
      presetSnapshot: snapshot,
      writingEngineVersion: WRITING_ENGINE_VERSION,
      seoSettings: null,
    });

    await deletePreset(customPreset.id);

    const reloaded = await getDocument(document.id);
    // Resolving the effective snapshot must still work — it reads the
    // Document's own frozen copy, never the (now-gone) live preset.
    const effective = resolveDocumentPresetSnapshot(reloaded!);
    expect(effective.name).toBe("Soon Deleted");
    expect(effective.rules).toEqual(["Keep it short"]);
  });
});

describe("Migration safety", () => {
  it("falls back to the default built-in preset when a Document has no snapshot", () => {
    const legacyDocument = { type: "youtube_script" as const, preset_snapshot: {} };
    const effective = resolveDocumentPresetSnapshot(legacyDocument);
    const expectedDefault = builtInPresetToResolved(getDefaultBuiltInPreset("youtube_script"));

    expect(effective.source).toBe("built_in");
    expect(effective.name).toBe(expectedDefault.name);
  });
});
