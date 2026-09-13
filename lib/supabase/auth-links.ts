import "server-only";
import { headers } from "next/headers";

/**
 * Builds an absolute `/auth/callback` URL for Supabase email links
 * (signup confirmation, password recovery), using the request's own origin
 * so this works in every environment (local dev, previews, production)
 * without a hardcoded site URL.
 */
export async function buildAuthCallbackUrl(next: string): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const url = new URL("/auth/callback", origin || "http://localhost");
  url.searchParams.set("next", next);
  return origin ? url.toString() : url.pathname + url.search;
}
