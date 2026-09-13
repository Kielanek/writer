import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthCallbackUrl } from "@/lib/supabase/auth-links";
import { forgotPasswordSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

/**
 * Always responds with `{ ok: true }` regardless of whether the email
 * belongs to an account — this must never confirm or deny that an email
 * address has an account (avoids account enumeration).
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const { email } = forgotPasswordSchema.parse(body);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await buildAuthCallbackUrl("/reset-password"),
  });
  // Logged, never surfaced: the response below must stay identical whether
  // or not the email belongs to an account, or Supabase accepted it.
  if (error) console.error("resetPasswordForEmail failed:", error);

  return NextResponse.json({ ok: true });
});
