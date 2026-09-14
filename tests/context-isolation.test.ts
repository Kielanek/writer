import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));

import { buildProjectContext } from "@/lib/context/buildProjectContext";
import { composeDocumentGenerationPrompt } from "@/lib/writing-engine/composePrompt";
import { getDefaultBuiltInPreset } from "@/lib/writing-engine/registry";
import { buildPresetSnapshot, builtInPresetToResolved } from "@/lib/writing-engine/snapshot";
import { buildAskProjectPrompt } from "@/lib/ai/prompts/askProject";

const PROJECT_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.tables["projects"] = [
    {
      id: PROJECT_A,
      user_id: FAKE_USER_ID,
      owner_id: FAKE_USER_ID,
      name: "Project A",
      description: "Project A description",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: PROJECT_B,
      user_id: FAKE_USER_ID,
      owner_id: FAKE_USER_ID,
      name: "Project B",
      description: "Project B description",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  fakeDb.tables["notes"] = [
    {
      id: "a-note-1",
      project_id: PROJECT_A,
      user_id: FAKE_USER_ID,
      type: "text",
      title: "A note",
      description: "",
      content: "SECRET_A_CONTENT: five mistakes Etsy sellers make",
      duration_seconds: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "b-note-1",
      project_id: PROJECT_B,
      user_id: FAKE_USER_ID,
      type: "text",
      title: "B note",
      description: "",
      content: "SECRET_B_CONTENT: completely unrelated project notes",
      duration_seconds: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
});

describe("buildProjectContext strict isolation", () => {
  it("never returns another project's notes", async () => {
    const contextA = await buildProjectContext(PROJECT_A);

    expect(contextA.notes).toHaveLength(1);
    expect(contextA.notes[0].project_id).toBe(PROJECT_A);
    expect(contextA.notesText).toContain("SECRET_A_CONTENT");
    expect(contextA.notesText).not.toContain("SECRET_B_CONTENT");
  });

  it("scopes correctly for the other project too", async () => {
    const contextB = await buildProjectContext(PROJECT_B);

    expect(contextB.notes).toHaveLength(1);
    expect(contextB.notesText).toContain("SECRET_B_CONTENT");
    expect(contextB.notesText).not.toContain("SECRET_A_CONTENT");
  });
});

describe("document generation grounding", () => {
  it("only includes notes from the requested project in the prompt", async () => {
    const context = await buildProjectContext(PROJECT_A);
    const presetSnapshot = buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset("summary")));
    const { prompt } = composeDocumentGenerationPrompt({
      context,
      documentType: "summary",
      instructions: "Summarize everything.",
      presetSnapshot,
      seoKeywords: null,
    });

    expect(prompt).toContain("SECRET_A_CONTENT");
    expect(prompt).not.toContain("SECRET_B_CONTENT");
  });
});

describe("Ask Project grounding", () => {
  it("only includes notes and history from the requested project in the prompt", async () => {
    const context = await buildProjectContext(PROJECT_A);
    const { prompt } = buildAskProjectPrompt({
      context,
      history: [],
      question: "What are my strongest opinions?",
    });

    expect(prompt).toContain("SECRET_A_CONTENT");
    expect(prompt).not.toContain("SECRET_B_CONTENT");
  });
});
