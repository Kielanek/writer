import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Privileged, server-only Supabase client authenticated with the secret key.
 * BYPASSES Row Level Security entirely.
 *
 * This must NEVER be used for ordinary user-facing CRUD (Projects, Notes,
 * Documents, Presets, Versions, Chat) — use lib/supabase/server.ts for that,
 * so RLS actually applies. Reserve this client for genuinely privileged,
 * explicitly-invoked operations such as the one-time legacy data claim
 * script (scripts/claim-legacy-data.ts). It must never be imported into a
 * Client Component and must never back a public API route.
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
