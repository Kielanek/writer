import type { DocumentType } from "@/types";
import type {
  Assertiveness,
  FirstPerson,
  Formality,
  LengthSettings,
  ListUsage,
  ParagraphStyle,
  PresetSettings,
  SentenceRhythm,
  VoiceTrait,
} from "./presetSettings";

/**
 * Turns a questionnaire answer set into readable, natural-language model
 * instructions — never raw JSON. This is the ONLY place that translates
 * PresetSettings into prompt text; both preset generation and AI editing
 * call it indirectly through composePrompt.ts, since both read from the
 * same frozen PresetSnapshot.
 */

const VOICE_LABELS: Record<VoiceTrait, string> = {
  direct: "direct",
  conversational: "conversational",
  expert: "expert",
  personal: "personal",
  educational: "educational",
  opinionated: "opinionated",
  casual: "casual",
  formal: "formal",
  provocative: "provocative",
  story_driven: "story-driven",
  concise: "concise",
};

const VOICE_CLAUSES: Record<VoiceTrait, string> = {
  direct: "Get to the point quickly rather than building up slowly.",
  conversational: "Write the way a thoughtful person would actually talk, not like a formal document.",
  expert: "Prefer specific, well-grounded observations over generic statements.",
  personal: "Let personal perspective come through where it's relevant.",
  educational: "Prioritize helping the reader understand, not just informing them.",
  opinionated: "Express clear opinions when they're supported by the source material.",
  casual: "Keep the tone relaxed and approachable.",
  formal: "Keep the tone polished and professional throughout.",
  provocative: "Be willing to challenge common assumptions when it's warranted.",
  story_driven: "Let narrative and concrete moments carry the point where possible.",
  concise: "Favor brevity; cut anything that doesn't earn its place.",
};

const FORMALITY_CLAUSES: Record<Formality, string> = {
  casual: "Keep the overall register casual and approachable.",
  balanced: "Keep the overall register natural: neither stiff nor overly casual.",
  professional: "Keep the overall register professional and polished.",
};

const ASSERTIVENESS_CLAUSES: Record<Assertiveness, string> = {
  soft: "Hedge claims where appropriate; avoid overstating confidence.",
  balanced: "State points clearly without being timid or overly forceful.",
  strong: "State opinions with strong, clear conviction when supported by the source material.",
};

const FIRST_PERSON_CLAUSES: Record<FirstPerson, string> = {
  rarely: "Use first person sparingly; keep the focus on the subject, not the narrator.",
  when_natural: "Use first person when it feels natural, not as a rule.",
  frequently: "Write primarily from a first-person point of view.",
};

const PARAGRAPH_STYLE_CLAUSES: Record<ParagraphStyle, string> = {
  short_punchy: "Keep paragraphs short and punchy.",
  natural_variation: "Let paragraph length vary naturally with the idea, not a fixed pattern.",
  longer_editorial: "Use longer, more developed editorial paragraphs.",
};

const SENTENCE_RHYTHM_CLAUSES: Record<SentenceRhythm, string> = {
  mostly_short: "Favor mostly short sentences.",
  mixed: "Vary sentence length naturally.",
  more_detailed: "Allow more detailed, longer sentences where the idea needs room.",
};

const LIST_USAGE_CLAUSES: Record<ListUsage, string> = {
  avoid: "Avoid bullet or numbered lists; write in prose.",
  when_useful: "Use lists only when the content is genuinely list-like.",
  often: "Use lists freely where they aid readability.",
};

function formatVoiceSection(settings: PresetSettings): string[] {
  if (settings.voice.length === 0) return [];
  const labels = settings.voice.map((v) => VOICE_LABELS[v]);
  const lines = [`Use a ${labels.join(", ")} voice.`];
  for (const trait of settings.voice) lines.push(VOICE_CLAUSES[trait]);
  lines.push(FORMALITY_CLAUSES[settings.formality]);
  lines.push(ASSERTIVENESS_CLAUSES[settings.assertiveness]);
  lines.push(FIRST_PERSON_CLAUSES[settings.firstPerson]);
  return lines;
}

function formatLengthSection(length: LengthSettings, documentType: DocumentType): string[] {
  const unitLabel = length.unit === "minutes" ? "minutes" : length.unit;

  if (length.mode === "custom" && length.min != null && length.max != null) {
    return [`Aim for roughly ${length.min}-${length.max} ${unitLabel}.`];
  }

  if (documentType === "summary") {
    const summaryLabel = { short: "brief", medium: "balanced", long: "detailed", custom: "balanced" }[length.mode];
    return [`Keep the summary ${summaryLabel} in detail.`];
  }

  const modeLabel = { short: "short", medium: "medium-length", long: "long", custom: "medium-length" }[length.mode];
  return [`Aim for a ${modeLabel} result.`];
}

function formatStructureSection(settings: PresetSettings, documentType: DocumentType): string[] {
  const lines = [
    PARAGRAPH_STYLE_CLAUSES[settings.paragraphStyle],
    SENTENCE_RHYTHM_CLAUSES[settings.sentenceRhythm],
    LIST_USAGE_CLAUSES[settings.listUsage],
  ];

  const t = settings.typeSpecific;

  if (t.documentType === "linkedin_post" && documentType === "linkedin_post") {
    if (t.openingStyles.length > 0 && !t.openingStyles.includes("let_ai_choose")) {
      lines.push(`Open with one of: ${t.openingStyles.map(readableEnum).join(", ")}.`);
    }
    if (t.endingStyles.length > 0 && !t.endingStyles.includes("let_it_end_naturally")) {
      lines.push(`End with one of: ${t.endingStyles.map(readableEnum).join(", ")}.`);
    }
    if (t.avoidForcedEndings) {
      lines.push(
        "Do not add a call-to-action, question, or summary just because the post is ending — only if it genuinely fits."
      );
    }
    lines.push(
      t.emojis === "never"
        ? "Do not use emojis."
        : t.emojis === "sparingly"
          ? "Use emojis sparingly, only if they genuinely add something."
          : "Emojis are allowed where they fit naturally."
    );
    lines.push(
      t.hashtags === "never"
        ? "Do not use hashtags."
        : t.hashtags === "only_if_requested"
          ? "Only use hashtags if the user's instructions specifically ask for them."
          : "Hashtags are allowed where they fit naturally."
    );
  }

  if (t.documentType === "article" && documentType === "article") {
    if (t.introStyle !== "let_ai_choose") lines.push(`Open the introduction with: ${readableEnum(t.introStyle)}.`);
    lines.push(`Use a ${readableEnum(t.headings)} amount of headings.`);
    lines.push(`Go into ${readableEnum(t.depth)} depth.`);
    if (t.conclusionStyle === "no_forced_conclusion") {
      lines.push("Do not force a conclusion section if the piece has already made its point.");
    } else {
      lines.push(`End with: ${readableEnum(t.conclusionStyle)}.`);
    }
  }

  if (t.documentType === "youtube_script" && documentType === "youtube_script") {
    if (t.hookStyle !== "let_ai_choose") lines.push(`Open the hook with: ${readableEnum(t.hookStyle)}.`);
    lines.push(`Use ${readableEnum(t.pacing)} pacing.`);
    lines.push(`Use a ${readableEnum(t.structure)} structure.`);
    if (t.ctaStyle !== "let_ai_choose") {
      lines.push(t.ctaStyle === "none" ? "Do not include a call-to-action." : `Use a ${readableEnum(t.ctaStyle)} call-to-action.`);
    }
    lines.push(
      t.productionNotes === "no"
        ? "Do not include production annotations like B-ROLL/ON SCREEN/NOTE."
        : t.productionNotes === "only_when_useful"
          ? "Only include production annotations like B-ROLL/ON SCREEN/NOTE when they genuinely help."
          : "Include helpful production annotations like B-ROLL/ON SCREEN/NOTE where useful."
    );
  }

  if (t.documentType === "newsletter" && documentType === "newsletter") {
    if (t.style !== "flexible") lines.push(`Write in a ${readableEnum(t.style)} style.`);
    if (t.opening !== "let_ai_choose") lines.push(`Open with: ${readableEnum(t.opening)}.`);
    if (t.ending === "no_forced_ending") {
      lines.push("Do not force a closing line if the piece has already made its point.");
    } else {
      lines.push(`End with: ${readableEnum(t.ending)}.`);
    }
    lines.push(
      t.greeting === "none"
        ? "Do not open with a formal greeting line."
        : `Use a ${readableEnum(t.greeting)} greeting.`
    );
  }

  if (t.documentType === "summary" && documentType === "summary") {
    lines.push(`Format: ${readableEnum(t.format)}.`);
    if (t.focus.length > 0) {
      lines.push(`Prioritize: ${t.focus.map(readableEnum).join(", ")}.`);
    }
  }

  return lines.filter(Boolean);
}

function readableEnum(value: string): string {
  return value.replace(/_/g, " ");
}

function section(title: string, lines: string[]): string | null {
  if (lines.length === 0) return null;
  return `${title}:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/**
 * Compiles a full PresetSettings object into a multi-section instruction
 * block (PURPOSE / AUDIENCE / VOICE / STRUCTURE / LENGTH). Returns "" if
 * there's nothing meaningful to say (e.g. an empty/default settings object),
 * so callers can skip the section entirely.
 */
export function compilePresetSettingsInstructions(settings: PresetSettings, documentType: DocumentType): string {
  const sections = [
    settings.purpose ? `PURPOSE:\n${settings.purpose}` : null,
    settings.audience ? `AUDIENCE:\n${settings.audience}` : null,
    section("VOICE", formatVoiceSection(settings)),
    section("STRUCTURE", formatStructureSection(settings, documentType)),
    section("LENGTH", formatLengthSection(settings.length, documentType)),
  ].filter((s): s is string => Boolean(s));

  return sections.join("\n\n");
}
