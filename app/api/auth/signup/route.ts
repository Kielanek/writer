import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthCallbackUrl } from "@/lib/supabase/auth-links";
import { signUpSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

/**
 * Creates a Supabase Auth account. Whether this returns an active session
 * depends on the Supabase project's email-confirmation setting — the client
 * checks `session` in the response to decide whether to show "check your
 * email" or send the user straight into the app.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const { email, password } = signUpSchema.parse(body);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await buildAuthCallbackUrl("/") },
  });

  if (error) {
    console.error("Signup failed:", error);
    return NextResponse.json({ error: "Could not create an account with those details." }, { status: 400 });
  }

  return NextResponse.json(
    { needsEmailConfirmation: !data.session, email },
    { status: 201 }
  );
});
