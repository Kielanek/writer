import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(),
  AiGenerationError: class AiGenerationError extends Error {},
}));

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

import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import { analyzeWritingExamples } from "@/lib/ai/analyzeWritingExamples";

function textResult(text: string) {
  return { text, usage: null };
}

const billing = { billingUserId: FAKE_USER_ID, actorUserId: FAKE_USER_ID };

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.currentUserId = FAKE_USER_ID;
});

describe("analyzeWritingExamples", () => {
  it("returns validated structured output on a well-formed model response", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      textResult(
        JSON.stringify({
          suggestedRules: ["Open with a direct claim.", "Use concrete examples."],
          suggestedAvoidRules: ["Avoid rhetorical questions."],
          observations: ["Direct opening", "Medium-length paragraphs"],
        })
      )
    );

    const result = await analyzeWritingExamples(
      {
        documentType: "linkedin_post",
        positiveExample: "Some liked example text.",
      },
      billing
    );

    expect(result.suggestedRules).toEqual(["Open with a direct claim.", "Use concrete examples."]);
    expect(result.suggestedAvoidRules).toEqual(["Avoid rhetorical questions."]);
    expect(result.observations).toEqual(["Direct opening", "Medium-length paragraphs"]);
  });

  it("tolerates a response wrapped in markdown code fences", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      textResult(
        "```json\n" + JSON.stringify({ suggestedRules: [], suggestedAvoidRules: [], observations: [] }) + "\n```"
      )
    );

    const result = await analyzeWritingExamples({ documentType: "article", positiveExample: "text" }, billing);
    expect(result).toEqual({ suggestedRules: [], suggestedAvoidRules: [], observations: [] });
  });

  it("throws a clear AiGenerationError when the model returns invalid JSON", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(textResult("not valid json at all"));

    await expect(
      analyzeWritingExamples({ documentType: "summary", positiveExample: "text" }, billing)
    ).rejects.toThrow(AiGenerationError);
  });

  it("throws when a field has the wrong type (e.g. a string instead of an array)", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(textResult(JSON.stringify({ suggestedRules: "not an array" })));

    await expect(
      analyzeWritingExamples({ documentType: "summary", positiveExample: "text" }, billing)
    ).rejects.toThrow(AiGenerationError);
  });
});
