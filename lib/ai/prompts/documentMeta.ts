export interface DocumentMetaPrompt {
  system: string;
  prompt: string;
}

/** Builds the prompt used to derive a Google-search meta title + description from an Article's content. */
export function buildDocumentMetaPrompt(input: {
  title: string;
  content: string;
  primaryKeyword?: string;
}): DocumentMetaPrompt {
  return {
    system: [
      "You write SEO meta title and meta description tags for a blog article, optimized for how they display in Google search results.",
      "Given the article's title and content, produce a compelling meta title and meta description.",
      "Respond in the same language as the article content.",
      "Respond ONLY with valid JSON in this exact shape, no markdown fences:",
      '{"metaTitle": string, "metaDescription": string}',
      "The meta title must be 60 characters or fewer.",
      "The meta description must be 160 characters or fewer, and written to make someone want to click through from search results.",
      "If a primary keyword is given, include it naturally in both the meta title and meta description — never forced or repeated unnaturally.",
      "Do not invent facts that are not present in the content.",
    ].join("\n"),
    prompt: [
      input.primaryKeyword ? `Primary keyword: ${input.primaryKeyword}` : null,
      `Article title: ${input.title || "(untitled)"}`,
      `Article content:\n"""\n${input.content}\n"""`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export interface ParsedDocumentMeta {
  metaTitle: string;
  metaDescription: string;
}

/** Parses the model's JSON response, tolerating minor formatting noise (matching lib/ai/prompts/noteMetadata.ts's convention). */
export function parseDocumentMetaResponse(raw: string): ParsedDocumentMeta {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.metaTitle !== "string" || typeof parsed.metaDescription !== "string") {
    throw new Error("Malformed SEO meta response");
  }
  return {
    metaTitle: parsed.metaTitle.trim().slice(0, 300),
    metaDescription: parsed.metaDescription.trim().slice(0, 500),
  };
}
