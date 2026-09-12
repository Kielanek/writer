import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/generateText", () => ({
  generateText: vi.fn(),
  AiGenerationError: class AiGenerationError extends Error {},
}));

import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import { analyzeWritingExamples } from "@/lib/ai/analyzeWritingExamples";

describe("analyzeWritingExamples", () => {
  it("returns validated structured output on a well-formed model response", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      JSON.stringify({
        suggestedRules: ["Open with a direct claim.", "Use concrete examples."],
        suggestedAvoidRules: ["Avoid rhetorical questions."],
        observations: ["Direct opening", "Medium-length paragraphs"],
      })
    );

    const result = await analyzeWritingExamples({
      documentType: "linkedin_post",
      positiveExample: "Some liked example text.",
    });

    expect(result.suggestedRules).toEqual(["Open with a direct claim.", "Use concrete examples."]);
    expect(result.suggestedAvoidRules).toEqual(["Avoid rhetorical questions."]);
    expect(result.observations).toEqual(["Direct opening", "Medium-length paragraphs"]);
  });

  it("tolerates a response wrapped in markdown code fences", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      "```json\n" + JSON.stringify({ suggestedRules: [], suggestedAvoidRules: [], observations: [] }) + "\n```"
    );

    const result = await analyzeWritingExamples({ documentType: "article", positiveExample: "text" });
    expect(result).toEqual({ suggestedRules: [], suggestedAvoidRules: [], observations: [] });
  });

  it("throws a clear AiGenerationError when the model returns invalid JSON", async () => {
    vi.mocked(generateText).mockResolvedValueOnce("not valid json at all");

    await expect(
      analyzeWritingExamples({ documentType: "summary", positiveExample: "text" })
    ).rejects.toThrow(AiGenerationError);
  });

  it("throws when a field has the wrong type (e.g. a string instead of an array)", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ suggestedRules: "not an array" }));

    await expect(
      analyzeWritingExamples({ documentType: "summary", positiveExample: "text" })
    ).rejects.toThrow(AiGenerationError);
  });
});
