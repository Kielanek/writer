import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Optimistic route protection + Supabase session cookie refresh.
 *
 * This is a fast, cookie-only check — it is NOT the security boundary.
 * Every Server Action, Route Handler, and lib/db/*.ts function re-verifies
 * the session itself (via lib/supabase/auth.ts's requireUser(), which calls
 * the validated supabase.auth.getUser()) and Row Level Security enforces
 * ownership at the database. This file exists to give unauthenticated
 * visitors a clean redirect to /login instead of a data-fetch error, and to
 * keep the Supabase auth cookie fresh on every request.
 */

// Reachable without a session, and never bounced away for an authenticated user.
const PUBLIC_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Validated (network round-trip), not the optimistic getSession() — this
  // is still cheap enough to run on every request and avoids trusting an
  // unverified cookie payload even for a redirect-only decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isAuthRoute = pathname.startsWith("/auth/");
  const isPublicPage = PUBLIC_PATHS.has(pathname);

  if (!user && !isApiRoute && !isAuthRoute && !isPublicPage) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization files.
     * Deliberately still runs on /api/* — see the note above on Server
     * Functions/Route Handlers not being separate routes in this chain.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
