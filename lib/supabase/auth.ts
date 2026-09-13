import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/utils/api";

/**
 * THE single way to read "who is making this request" anywhere on the
 * server. Always calls supabase.auth.getUser(), which round-trips to
 * Supabase Auth to validate the session token — NEVER auth.getSession(),
 * whose user object comes straight from the (spoofable) cookie without
 * server-side verification.
 *
 * Wrapped in React's cache() so repeated calls within a single request/
 * render pass reuse one validation instead of hitting Supabase Auth
 * repeatedly.
 */
export const getAuthedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/**
 * Use at the top of every lib/db/*.ts function, Server Action, and Route
 * Handler that touches user-owned data. Throws a 401 ApiError — caught by
 * withApiErrorHandling in API routes — if there is no valid session.
 */
export async function requireUser(): Promise<User> {
  const user = await getAuthedUser();
  if (!user) {
    throw new ApiError(401, "You must be signed in to do that.");
  }
  return user;
}
