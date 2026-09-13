import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for Supabase Auth email links: signup confirmation and
 * password recovery both redirect here with a `code` param, which is
 * exchanged for a real session (cookies are set on this response by the
 * server client). `next` controls where the user lands afterwards —
 * "/reset-password" for the recovery flow, "/" (default) for signup
 * confirmation. See lib/supabase/auth-links.ts for where these URLs are built.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", "auth_link_invalid");
  return NextResponse.redirect(errorUrl);
}
