import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fakeSupabase";

/**
 * The two-user security test from the Auth spec, at the lib/db layer:
 * User A's rows must never be visible to, editable by, or deletable by
 * User B, even when User B has the exact UUID. Real Row Level Security is
 * exercised separately in tests/rls-policies.test.ts (SQL-level, against
 * the actual policies in supabase/migrations/0006_auth_and_rls.sql) — this
 * file verifies the application-layer `.eq("user_id", ...)` filtering that
 * lib/db/*.ts adds as defense in depth on top of RLS.
 *
 * `currentUserId` lets each test switch which user is "logged in" without
 * re-mocking between files.
 */
let currentUserId = "";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: currentUserId }),
  getAuthedUser: async () => ({ id: currentUserId }),
}));

import { createProject, deleteProject, getProject, updateProject } from "@/lib/db/projects";
import { createNote, getNote } from "@/lib/db/notes";
import { createDocument, getDocument, listDocumentVersions } from "@/lib/db/documents";
import { createPreset } from "@/lib/writing-engine/customPresets/service";
import { getCustomPreset } from "@/lib/db/writingPresets";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

/** Keeps the requireUser() mock and the fake's own auth.uid() stand-in (used by RPCs like create_project_with_limit) in sync. */
function setCurrentUser(id: string) {
  currentUserId = id;
  fakeDb.currentUserId = id;
}

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  // Every user has the default "development" plan's maxProjects (50) —
  // profiles is empty in these tests, and getUserPlan() falls back to the
  // default plan when no row exists, so this is just documenting that
  // assumption rather than something these tests need to seed.
});

describe("Projects: cross-user isolation", () => {
  it("User B cannot read, update, or delete User A's Project by UUID", async () => {
    setCurrentUser(USER_A);
    const project = await createProject({ name: "A's project", description: null });

    setCurrentUser(USER_B);
    expect(await getProject(project.id)).toBeNull();
    await expect(updateProject(project.id, { name: "Hijacked" })).rejects.toBeTruthy();
    await expect(deleteProject(project.id)).resolves.toBeUndefined(); // no-op: filter matches 0 rows

    setCurrentUser(USER_A);
    const stillThere = await getProject(project.id);
    expect(stillThere?.name).toBe("A's project");
  });

  it("a created Project is always owned by the authenticated caller, never a client-supplied id", async () => {
    setCurrentUser(USER_A);
    const project = await createProject({ name: "Mine", description: null });
    expect(project.user_id).toBe(USER_A);
  });
});

describe("Notes: cross-user isolation", () => {
  it("User B cannot read User A's Note by UUID", async () => {
    setCurrentUser(USER_A);
    const project = await createProject({ name: "A's project", description: null });
    const note = await createNote({
      projectId: project.id,
      type: "text",
      title: "Secret",
      description: "",
      content: "SECRET_NOTE_CONTENT",
    });

    setCurrentUser(USER_B);
    expect(await getNote(note.id)).toBeNull();
  });
});

describe("Documents and versions: cross-user isolation", () => {
  it("User B cannot read User A's Document or its versions by UUID", async () => {
    setCurrentUser(USER_A);
    const project = await createProject({ name: "A's project", description: null });
    const document = await createDocument({
      projectId: project.id,
      type: "summary",
      title: "Summary",
      creationInstructions: "",
      content: "SECRET_DOC_CONTENT",
      presetId: "summary-default",
      presetSnapshot: {},
      writingEngineVersion: 1,
      seoSettings: null,
    });
    // A real document_versions row owned by User A (bypassing the RPC,
    // which the in-memory fake doesn't model ownership for) so the
    // isolation check below is meaningful rather than trivially empty.
    fakeDb.tables["document_versions"] = [
      {
        id: "v1",
        document_id: document.id,
        user_id: USER_A,
        version_number: 1,
        content: "SECRET_DOC_CONTENT",
        source: "initial",
        instruction: null,
        restored_from_version: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    setCurrentUser(USER_B);
    expect(await getDocument(document.id)).toBeNull();
    expect(await listDocumentVersions(document.id)).toEqual([]);

    setCurrentUser(USER_A);
    expect(await listDocumentVersions(document.id)).toHaveLength(1);
  });
});

describe("Writing Presets: cross-user isolation", () => {
  it("User B cannot read or resolve User A's custom Preset by UUID", async () => {
    setCurrentUser(USER_A);
    const preset = await createPreset({
      documentType: "linkedin_post",
      name: "A's private style",
      description: null,
      rules: ["Rule"],
      avoidRules: [],
    });

    setCurrentUser(USER_B);
    expect(await getCustomPreset(preset.id)).toBeNull();
  });
});
