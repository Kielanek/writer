function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Centralized, validated access to server-only environment variables.
 * Import this instead of reading `process.env` directly so missing
 * configuration fails fast with a clear message.
 */
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  openaiApiKey: () => required("OPENAI_API_KEY"),

  /** Speech-to-text only. Kept independent from the text model below. */
  openaiTranscriptionModel: () =>
    process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",

  /**
   * THE single source of truth for the text-generation model. Every
   * writing operation — document generation (all 5 document types),
   * AI document editing, Ask Project, and note title/description
   * metadata — must call this instead of hardcoding a model name.
   * In practice this means calling lib/ai/generateText.ts, which is the
   * only place that reads this value.
   */
  openaiTextModel: () => process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
};
