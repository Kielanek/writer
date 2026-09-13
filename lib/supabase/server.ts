import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Session-aware Supabase client for ordinary application data access.
 * Reads the authenticated user's session from cookies, so every query made
 * with this client is subject to Row Level Security as that user — this is
 * the ONLY client normal Project/Note/Document/Preset/Version/Chat code
 * should use.
 *
 * Must be created fresh per request (it closes over the current request's
 * cookies via next/headers), so call this at the top of every Server
 * Component, Server Action, or Route Handler that needs it rather than
 * caching the client itself.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies can't be written.
          // Harmless as long as proxy.ts refreshes the session on the way in.
        }
      },
    },
  });
}
