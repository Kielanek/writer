import { describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(async () => {
    throw new Error("AI service unavailable");
  }),
  AiGenerationError: class AiGenerationError extends Error {},
}));

// generateNoteMetadata now goes through guardedGenerateText (provider-cost
// accounting) before ever reaching the mocked generateText above — these
// mocks keep that path on the in-memory fake instead of hitting real
// Supabase/next/headers outside of a request context.
vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeDb,
}));

import { generateNoteMetadata } from "@/lib/ai/noteMetadata";

describe("generateNoteMetadata fallback behavior", () => {
  it("never throws, and returns a usable fallback when generation fails", async () => {
    const result = await generateNoteMetadata("Some transcribed content that must not be lost.");

    expect(result.title).toMatch(/Voice Note/);
    expect(result.description).toBe("");
  });
});
