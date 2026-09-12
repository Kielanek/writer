import { describe, expect, it } from "vitest";
import { createDocumentSchema, documentTypeSchema } from "@/lib/validation/schemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("documentTypeSchema", () => {
  it("accepts the four active document types", () => {
    for (const type of ["linkedin_post", "article", "newsletter", "summary"]) {
      expect(documentTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects youtube_script — it is no longer creatable", () => {
    expect(documentTypeSchema.safeParse("youtube_script").success).toBe(false);
  });

  it("rejects seo_article — Article is always SEO-focused, there is no separate type", () => {
    expect(documentTypeSchema.safeParse("seo_article").success).toBe(false);
  });
});

describe("createDocumentSchema", () => {
  const base = {
    projectId: VALID_UUID,
    presetId: "some-preset",
    instructions: "Write something.",
  };

  it("requires seoSettings (with a primary keyword) for every Article — there is no SEO toggle", () => {
    expect(createDocumentSchema.safeParse({ ...base, type: "article" }).success).toBe(false);
    expect(
      createDocumentSchema.safeParse({
        ...base,
        type: "article",
        seoSettings: { primaryKeyword: "digital products on Etsy" },
      }).success
    ).toBe(true);
  });

  it("does not require seoSettings for non-Article types", () => {
    expect(createDocumentSchema.safeParse({ ...base, type: "linkedin_post" }).success).toBe(true);
    expect(createDocumentSchema.safeParse({ ...base, type: "newsletter" }).success).toBe(true);
    expect(createDocumentSchema.safeParse({ ...base, type: "summary" }).success).toBe(true);
  });

  it("rejects a youtube_script creation request outright", () => {
    expect(createDocumentSchema.safeParse({ ...base, type: "youtube_script" }).success).toBe(false);
  });

  it("rejects a seo_article creation request outright — that type no longer exists", () => {
    expect(createDocumentSchema.safeParse({ ...base, type: "seo_article" }).success).toBe(false);
  });
});
