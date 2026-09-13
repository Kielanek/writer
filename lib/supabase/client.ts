"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-safe Supabase client. Uses only the publishable key — never the
 * secret key. Session cookies are managed automatically by @supabase/ssr.
 *
 * Reads NEXT_PUBLIC_* env vars directly (rather than through lib/env.ts) so
 * this module never even references a server-only variable name, keeping
 * the client bundle unambiguously free of secrets.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
