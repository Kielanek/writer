/**
 * One-time/occasional developer script: assigns a plan to one account.
 *
 * This is NOT an API route and must never become one — plan_id has zero
 * write grants for `authenticated` (see supabase/migrations/0007 and
 * 0009), so the ONLY way to change it today is this script, using the
 * admin/secret client directly against the table (profiles has no RPC
 * gate the way provider_cost_reservations does, since plan assignment
 * itself isn't a per-request hot path that needs one — it's an occasional,
 * fully out-of-band operation). It only ever runs from a developer's own
 * machine/CI, never in response to an HTTP request.
 *
 * This is a deliberately manual stand-in for what a future Stripe
 * webhook/trial-signup flow will do automatically (see
 * lib/entitlements/plans.ts's doc comment on the `trial` plan).
 *
 * Usage:
 *
 *   npm run set-user-plan -- <USER_UUID> <development|trial|pro>
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const VALID_PLAN_IDS = ["development", "trial", "pro"];

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function main() {
  loadDotEnvLocal();

  const [userId, planId] = process.argv.slice(2);

  if (!userId || !isValidUuid(userId) || !planId || !VALID_PLAN_IDS.includes(planId)) {
    console.error("Usage: npm run set-user-plan -- <USER_UUID> <development|trial|pro>");
    console.error("\nGet a user's UUID from Supabase Dashboard -> Authentication -> Users.");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Set them in .env.local first."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userLookup, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userLookup?.user) {
    console.error(`No Supabase Auth user found with id ${userId}.`);
    process.exit(1);
  }

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("plan_id")
    .eq("id", userId)
    .maybeSingle();
  if (existingError) {
    console.error("Failed to read current plan:", existingError.message);
    process.exit(1);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ plan_id: planId })
    .eq("id", userId);

  if (updateError) {
    console.error("Failed to update plan:", updateError.message);
    process.exit(1);
  }

  console.log(
    `${userLookup.user.email ?? userId}: ${existing?.plan_id ?? "(no profile row)"} -> ${planId}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
