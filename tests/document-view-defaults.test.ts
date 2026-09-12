import { describe, expect, it } from "vitest";
import { defaultDocumentViewMode } from "@/components/documents/document-mode-switch";
import type { DocumentType } from "@/types";

describe("default Document view mode", () => {
  const TYPES_WITH_PREVIEW_DEFAULT: DocumentType[] = ["article", "newsletter", "youtube_script", "summary"];

  it.each(TYPES_WITH_PREVIEW_DEFAULT)("%s opens in Preview by default", () => {
    expect(defaultDocumentViewMode()).toBe("preview");
  });
});
