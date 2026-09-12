import { describe, expect, it } from "vitest";
import {
  presetSettingsSchema,
  defaultPresetSettings,
  defaultLengthForType,
  defaultTypeSpecificSettings,
} from "@/lib/writing-engine/presetSettings";
import { createPresetSchema } from "@/lib/validation/schemas";
import type { DocumentType } from "@/types";

const ALL_TYPES: DocumentType[] = ["linkedin_post", "article", "youtube_script", "newsletter", "summary"];

describe("default settings per document type", () => {
  it.each(ALL_TYPES)("produces a valid, type-scoped settings object for %s", (type) => {
    const settings = defaultPresetSettings(type);
    expect(() => presetSettingsSchema.parse(settings)).not.toThrow();
    expect(settings.typeSpecific.documentType).toBe(type);
  });

  it("length units are correct per document type", () => {
    expect(defaultLengthForType("linkedin_post").unit).toBe("characters");
    expect(defaultLengthForType("article").unit).toBe("words");
    expect(defaultLengthForType("newsletter").unit).toBe("words");
    expect(defaultLengthForType("youtube_script").unit).toBe("minutes");
    expect(defaultLengthForType("summary").unit).toBe("words");
  });
});

describe("document-type-specific fields stay scoped to their type", () => {
  it("LinkedIn settings do not appear on Article's type-specific settings", () => {
    const article = defaultTypeSpecificSettings("article");
    expect(article.documentType).toBe("article");
    expect("openingStyles" in article).toBe(false);
    expect("introStyle" in article).toBe(true);
  });

  it("Article heading settings do not appear on LinkedIn's type-specific settings", () => {
    const linkedin = defaultTypeSpecificSettings("linkedin_post");
    expect(linkedin.documentType).toBe("linkedin_post");
    expect("headings" in linkedin).toBe(false);
    expect("openingStyles" in linkedin).toBe(true);
  });

  it("YouTube settings do not appear on Newsletter's type-specific settings", () => {
    const newsletter = defaultTypeSpecificSettings("newsletter");
    expect("hookStyle" in newsletter).toBe(false);
    expect("greeting" in newsletter).toBe(true);
  });
});

describe("voice selection max limit", () => {
  it("rejects more than 3 voice traits", () => {
    const settings = defaultPresetSettings("article");
    const invalid = { ...settings, voice: ["direct", "conversational", "expert", "concise"] };
    expect(() => presetSettingsSchema.parse(invalid)).toThrow();
  });

  it("accepts exactly 3 voice traits", () => {
    const settings = defaultPresetSettings("article");
    const valid = { ...settings, voice: ["direct", "conversational", "expert"] };
    expect(() => presetSettingsSchema.parse(valid)).not.toThrow();
  });
});

describe("length min/max validation", () => {
  it("rejects a custom length where min exceeds max", () => {
    const settings = defaultPresetSettings("article");
    const invalid = { ...settings, length: { mode: "custom", unit: "words", min: 2000, max: 500 } };
    expect(() => presetSettingsSchema.parse(invalid)).toThrow();
  });
});

describe("createPresetSchema cross-checks settings against documentType", () => {
  it("rejects settings whose typeSpecific.documentType does not match the top-level documentType", () => {
    const body = {
      documentType: "article",
      name: "Mismatched",
      rules: [],
      avoidRules: [],
      settings: defaultPresetSettings("linkedin_post"),
    };
    expect(() => createPresetSchema.parse(body)).toThrow();
  });

  it("accepts settings whose typeSpecific.documentType matches", () => {
    const body = {
      documentType: "article",
      name: "Matched",
      rules: [],
      avoidRules: [],
      settings: defaultPresetSettings("article"),
    };
    expect(() => createPresetSchema.parse(body)).not.toThrow();
  });
});
