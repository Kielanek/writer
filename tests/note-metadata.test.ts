import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(async () => {
    throw new Error("AI service unavailable");
  }),
  AiGenerationError: class AiGenerationError extends Error {},
}));

import { generateNoteMetadata } from "@/lib/ai/noteMetadata";

describe("generateNoteMetadata fallback behavior", () => {
  it("never throws, and returns a usable fallback when generation fails", async () => {
    const result = await generateNoteMetadata("Some transcribed content that must not be lost.");

    expect(result.title).toMatch(/Voice Note/);
    expect(result.description).toBe("");
  });
});
