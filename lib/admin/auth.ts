import "server-only";
import type { User } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/supabase/auth";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/utils/api";

/**
 * The ONLY source of admin authorization in this app: a server-only env
 * var (ADMIN_USER_IDS), compared against the validated session user's id
 * (never a client-supplied value, a plan_id, or anything else that could
 * be spoofed). Every /admin page and every /api/admin/* route must call
 * requireAdmin() independently — the UI (e.g. hiding the nav link for
 * non-admins) is convenience, never the security boundary.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getAuthedUser();
  if (!user) return false;
  return env.adminUserIds().includes(user.id);
}

/**
 * Throws a 404 (not 401/403) for non-admins — deliberately indistinguishable
 * from the route not existing at all, so an authenticated non-admin probing
 * around can't even confirm an admin panel exists.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getAuthedUser();
  if (!user || !env.adminUserIds().includes(user.id)) {
    throw new ApiError(404, "Not found.");
  }
  return user;
}
