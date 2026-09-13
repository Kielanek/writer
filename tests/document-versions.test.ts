import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));

import { createDocumentVersion, listDocumentVersions } from "@/lib/db/documents";

const DOCUMENT_ID = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.tables["documents"] = [
    {
      id: DOCUMENT_ID,
      project_id: "44444444-4444-4444-4444-444444444444",
      user_id: FAKE_USER_ID,
      type: "summary",
      title: "Summary",
      creation_instructions: "",
      content: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
});

describe("document version numbering", () => {
  it("increments linearly starting at 1", async () => {
    const v1 = await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v1 content", source: "initial" });
    const v2 = await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v2 content", source: "manual" });
    const v3 = await createDocumentVersion({
      documentId: DOCUMENT_ID,
      content: "v3 content",
      source: "ai_edit",
      instruction: "Make it shorter",
    });

    expect(v1.version_number).toBe(1);
    expect(v2.version_number).toBe(2);
    expect(v3.version_number).toBe(3);
  });

  it("updates the document's working content on each version", async () => {
    await createDocumentVersion({ documentId: DOCUMENT_ID, content: "final content", source: "manual" });
    const doc = fakeDb.tables["documents"][0];
    expect(doc.content).toBe("final content");
  });
});

describe("restoring an old version", () => {
  it("creates a new version and keeps existing history intact", async () => {
    await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v1", source: "initial" });
    await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v2", source: "ai_edit", instruction: "edit" });
    await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v3", source: "manual" });
    await createDocumentVersion({ documentId: DOCUMENT_ID, content: "v4", source: "ai_edit", instruction: "edit 2" });

    // Restore v2's content.
    const restored = await createDocumentVersion({
      documentId: DOCUMENT_ID,
      content: "v2",
      source: "restore",
      restoredFromVersion: 2,
    });

    expect(restored.version_number).toBe(5);
    expect(restored.source).toBe("restore");
    expect(restored.restored_from_version).toBe(2);
    expect(restored.content).toBe("v2");

    const versions = await listDocumentVersions(DOCUMENT_ID);
    // All 5 versions must still exist — restoring never deletes history.
    expect(versions).toHaveLength(5);
    const versionNumbers = versions.map((v) => v.version_number).sort((a, b) => a - b);
    expect(versionNumbers).toEqual([1, 2, 3, 4, 5]);

    const doc = fakeDb.tables["documents"][0];
    expect(doc.content).toBe("v2");
  });
});
