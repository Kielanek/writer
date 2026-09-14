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
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),

  /**
   * Server-only. Was previously named SUPABASE_SERVICE_ROLE_KEY — both are
   * accepted so existing deployments keep working while credentials are
   * migrated to Supabase's newer secret-key naming. Never expose this value
   * to the browser, and never use it for ordinary user data access (see
   * lib/supabase/admin.ts).
   */
  supabaseSecretKey: () => {
    const value = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!value) {
      throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");
    }
    return value;
  },

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

  /**
   * Server-only, deliberately NOT NEXT_PUBLIC_ — comma-separated Supabase
   * auth user UUIDs authorized to access /admin and its API routes. See
   * lib/admin/auth.ts's requireAdmin(), the only place this is read.
   * Never derive admin access from anything client-supplied.
   */
  adminUserIds: (): string[] =>
    (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
};
