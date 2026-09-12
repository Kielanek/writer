/**
 * Cosmetic-only cleanup for LinkedIn Post preview/copy. New LinkedIn
 * generations and edits are instructed (lib/writing-engine/formats/linkedin.ts)
 * to never produce Markdown in the first place, so this is purely a
 * fallback for Documents generated before that rule existed.
 *
 * This NEVER touches the stored Document content — it only transforms the
 * string right before it's rendered or copied. It intentionally does not
 * try to be a full Markdown parser; it just strips the handful of symbols
 * that would otherwise show up as ugly raw syntax in a plain-text post.
 */
export function normalizeLinkedInText(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) // markdown separators
    .filter((line) => !/^\s*```/.test(line)) // code fence markers
    .map((line) => line.replace(/^\s*#{1,6}\s+/, "")) // leading heading markers
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/__(.+?)__/g, "$1") // __bold__
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1") // *italic*
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1"); // _italic_
}
