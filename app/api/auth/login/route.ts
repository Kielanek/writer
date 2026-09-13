import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const { email, password } = logInSchema.parse(body);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
});
