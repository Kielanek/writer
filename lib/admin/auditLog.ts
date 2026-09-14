import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Best-effort by design: a logging failure must never mask (or roll back)
 * the admin action that already succeeded, so this logs rather than
 * throws. `authenticated` has zero grant on admin_audit_log at all — only
 * this function (via the admin client, called from already-requireAdmin()'d
 * routes) can write here.
 */
export async function recordAdminAudit(input: {
  adminUserId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_log").insert({
      admin_user_id: input.adminUserId,
      action: input.action,
      metadata: input.metadata ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[admin-audit] failed to write audit log entry:", err);
  }
}
