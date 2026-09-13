/**
 * One-time developer script: assigns legacy data (created before Auth
 * existed, so user_id is still null on every row) to a single real account.
 *
 * This is NOT an API route and must never become one — it uses the
 * admin/secret Supabase client, which bypasses Row Level Security
 * entirely. It only ever runs from a developer's own machine/CI, never in
 * response to an HTTP request.
 *
 * Usage (see README's "Auth setup" section for the full walkthrough):
 *
 *   npm run claim-legacy-data -- <USER_UUID>           # dry run — lists counts only
 *   npm run claim-legacy-data -- <USER_UUID> --apply    # actually assigns the rows
 *
 * Idempotent: every update is scoped to `where user_id is null`, so running
 * it again (with the same or a different UUID) never re-assigns rows that
 * already have an owner — it only ever picks up whatever is still
 * unclaimed.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const LEGACY_OWNED_TABLES = [
  "projects",
  "notes",
  "documents",
  "document_versions",
  "project_chat_messages",
  "writing_presets",
] as const;

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

  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const userId = args.find((a) => !a.startsWith("--"));

  if (!userId || !isValidUuid(userId)) {
    console.error("Usage: npm run claim-legacy-data -- <USER_UUID> [--apply]");
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

  // Confirm the target user actually exists before touching any data.
  const { data: userLookup, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userLookup?.user) {
    console.error(`No Supabase Auth user found with id ${userId}.`);
    process.exit(1);
  }
  console.log(`Target account: ${userLookup.user.email ?? userId}\n`);

  console.log(apply ? "Claiming legacy (unowned) data...\n" : "Dry run — no changes will be made.\n");

  let totalClaimed = 0;

  for (const table of LEGACY_OWNED_TABLES) {
    const { count, error: countError } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .is("user_id", null);

    if (countError) {
      console.error(`Failed to count legacy rows in ${table}:`, countError.message);
      process.exit(1);
    }

    const legacyCount = count ?? 0;
    if (legacyCount === 0) {
      console.log(`${table}: no legacy rows.`);
      continue;
    }

    if (!apply) {
      console.log(`${table}: ${legacyCount} legacy row(s) would be assigned.`);
      continue;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from(table)
      .update({ user_id: userId })
      .is("user_id", null)
      .select("id");

    if (updateError) {
      console.error(`Failed to update ${table}:`, updateError.message);
      process.exit(1);
    }

    const updatedCount = updatedRows?.length ?? legacyCount;
    console.log(`${table}: assigned ${updatedCount} row(s).`);
    totalClaimed += updatedCount;
  }

  console.log(
    apply
      ? `\nDone. ${totalClaimed} total row(s) now belong to ${userLookup.user.email ?? userId}.`
      : "\nRe-run with --apply to actually assign the rows listed above."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
