import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { buildKeywordRegex } from "@/lib/utils/keywordMatching";

export interface KeywordHighlightSpec {
  keyword: string;
  /** Tailwind class(es) for the pastel highlight background. */
  className: string;
}

export interface SeoKeywordHighlightOptions {
  keywords: KeywordHighlightSpec[];
}

interface PluginState {
  focused: boolean;
}

const pluginKey = new PluginKey<PluginState>("seoKeywordHighlight");

/**
 * Builds decorations for every keyword occurrence in the document, skipping
 * any text node inside [skipFrom, skipTo) — the block currently being
 * edited, so highlighting never fights with cursor placement or selection
 * while the user is actively typing there. Longer keyword phrases are
 * matched first so a secondary keyword that is a substring of the primary
 * keyword (or another secondary keyword) never gets double-highlighted.
 */
function buildDecorations(
  doc: ProseMirrorNode,
  keywords: KeywordHighlightSpec[],
  skipFrom: number,
  skipTo: number
): DecorationSet {
  const active = keywords.filter((k) => k.keyword.trim().length > 0);
  if (active.length === 0) return DecorationSet.empty;

  const sorted = [...active].sort((a, b) => b.keyword.trim().length - a.keyword.trim().length);
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const nodeStart = pos;
    const nodeEnd = pos + node.text.length;
    if (nodeStart < skipTo && nodeEnd > skipFrom) return;

    const claimed: Array<[number, number]> = [];
    for (const { keyword, className } of sorted) {
      const regex = buildKeywordRegex(keyword);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(node.text)) !== null) {
        const start = nodeStart + match.index;
        const end = start + match[0].length;
        if (claimed.some(([s, e]) => start < e && end > s)) continue;
        claimed.push([start, end]);
        decorations.push(Decoration.inline(start, end, { class: className }));
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * View-only ProseMirror decorations — never touches document content, so
 * the persisted Markdown is guaranteed untouched by highlighting. Only
 * active when keywords are supplied; a normal Article editor (no keywords
 * option set) never pays for or shows any of this.
 */
export const SeoKeywordHighlight = Extension.create<SeoKeywordHighlightOptions>({
  name: "seoKeywordHighlight",

  addOptions() {
    return { keywords: [] };
  },

  addProseMirrorPlugins() {
    // Captured once at plugin creation — keywords are frozen for the
    // document session (see ArticleEditor), so this never goes stale.
    const { keywords } = this.options;

    return [
      new Plugin<PluginState>({
        key: pluginKey,
        state: {
          init: () => ({ focused: false }),
          apply(tr, value) {
            const meta = tr.getMeta(pluginKey);
            return meta ? meta : value;
          },
        },
        props: {
          handleDOMEvents: {
            focus(view) {
              view.dispatch(view.state.tr.setMeta(pluginKey, { focused: true }));
              return false;
            },
            blur(view) {
              view.dispatch(view.state.tr.setMeta(pluginKey, { focused: false }));
              return false;
            },
          },
          decorations(state) {
            const pluginState = pluginKey.getState(state);
            if (!pluginState?.focused) {
              return buildDecorations(state.doc, keywords, -1, -1);
            }
            const { $from, $to } = state.selection;
            const skipFrom = $from.start($from.depth);
            const skipTo = $to.end($to.depth);
            return buildDecorations(state.doc, keywords, skipFrom, skipTo);
          },
        },
      }),
    ];
  },
});
