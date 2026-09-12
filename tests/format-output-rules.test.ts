import { describe, expect, it } from "vitest";
import { getFormatRules } from "@/lib/writing-engine/formats";

describe("per-document-type output format rules", () => {
  it("linkedin_post rules forbid Markdown and require plain text", () => {
    const rules = getFormatRules("linkedin_post").join(" ");
    expect(rules).toMatch(/plain text/i);
    expect(rules).toMatch(/do not use markdown/i);
  });

  it("article rules require Markdown", () => {
    const rules = getFormatRules("article").join(" ");
    expect(rules).toMatch(/markdown/i);
  });

  it("newsletter rules allow lightweight Markdown", () => {
    const rules = getFormatRules("newsletter").join(" ");
    expect(rules).toMatch(/markdown/i);
  });

  it("youtube_script rules allow structured headings and production annotations", () => {
    const rules = getFormatRules("youtube_script").join(" ");
    expect(rules).toMatch(/heading/i);
    expect(rules).toMatch(/b-roll/i);
  });

  it("summary rules require Markdown", () => {
    const rules = getFormatRules("summary").join(" ");
    expect(rules).toMatch(/markdown/i);
  });
});
