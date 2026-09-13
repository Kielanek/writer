import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Session-aware Supabase client for ordinary application data access.
 * Respects Row Level Security — every query made with this client is
 * scoped to whoever is authenticated on the current request.
 *
 * This must NOT be the secret/admin client. Normal Project/Note/Document/
 * Preset/Version/Chat CRUD must always go through this so RLS is an actual
 * security boundary, not decorative SQL. See lib/supabase/admin.ts for the
 * (rare, explicitly-invoked) privileged alternative.
 */
export async function getSupabaseServerClient() {
  return createClient();
}
