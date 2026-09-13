import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

/**
 * Sets a new password for the currently-authenticated session. Reachable
 * only after the recovery link's /auth/callback exchange has established a
 * session — there is no separate recovery token here, by design (Supabase
 * treats the exchanged session as sufficiently proven for this one action).
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const { password } = resetPasswordSchema.parse(body);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Your password reset link has expired. Request a new one.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("updateUser (reset password) failed:", error);
    return NextResponse.json({ error: "Could not update your password. Try again." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});
