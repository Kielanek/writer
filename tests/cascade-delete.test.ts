import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));

import { deleteProject } from "@/lib/db/projects";

const PROJECT_ID = "55555555-5555-5555-5555-555555555555";
const DOCUMENT_ID = "66666666-6666-6666-6666-666666666666";

describe("schema declares cascading deletes", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0001_init.sql"),
    "utf-8"
  );

  it("cascades notes, documents, and chat messages from projects", () => {
    const projectFkBlocks = sql.match(
      /references projects \(id\)[^\n]*/g
    );
    expect(projectFkBlocks).not.toBeNull();
    for (const block of projectFkBlocks ?? []) {
      expect(block.toLowerCase()).toContain("on delete cascade");
    }
    // 3 tables reference projects: notes, documents, project_chat_messages
    expect(projectFkBlocks).toHaveLength(3);
  });

  it("cascades document_versions from documents", () => {
    const documentFkBlocks = sql.match(/references documents \(id\)[^\n]*/g);
    expect(documentFkBlocks).not.toBeNull();
    for (const block of documentFkBlocks ?? []) {
      expect(block.toLowerCase()).toContain("on delete cascade");
    }
  });
});

describe("deleting a project cascades in practice", () => {
  beforeEach(() => {
    Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
    fakeDb.tables["projects"] = [
      {
        id: PROJECT_ID,
        user_id: FAKE_USER_ID,
        name: "To delete",
        description: null,
        created_at: "x",
        updated_at: "x",
      },
    ];
    fakeDb.tables["notes"] = [
      { id: "n1", project_id: PROJECT_ID, type: "text", title: "", description: "", content: "" },
    ];
    fakeDb.tables["documents"] = [
      { id: DOCUMENT_ID, project_id: PROJECT_ID, type: "summary", title: "", content: "" },
    ];
    fakeDb.tables["document_versions"] = [
      { id: "v1", document_id: DOCUMENT_ID, version_number: 1, content: "", source: "initial" },
    ];
    fakeDb.tables["project_chat_messages"] = [
      { id: "m1", project_id: PROJECT_ID, role: "user", content: "hi" },
    ];
  });

  it("removes notes, documents, document_versions, and chat messages", async () => {
    await deleteProject(PROJECT_ID);

    expect(fakeDb.tables["projects"]).toHaveLength(0);
    expect(fakeDb.tables["notes"]).toHaveLength(0);
    expect(fakeDb.tables["documents"]).toHaveLength(0);
    expect(fakeDb.tables["document_versions"]).toHaveLength(0);
    expect(fakeDb.tables["project_chat_messages"]).toHaveLength(0);
  });
});
