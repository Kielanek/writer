import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { getAuthedUser } from "@/lib/supabase/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getUserPlan } from "@/lib/entitlements/profile";
import { UserMenu } from "@/components/auth/user-menu";
import { Logo } from "@/components/brand/logo";

/** Renders nothing for signed-out visitors (e.g. on /login, /signup). */
export async function SiteHeader() {
  const user = await getAuthedUser();
  if (!user) return null;

  // Convenience only — /admin and every /api/admin/* route independently
  // re-verify via requireAdmin(), so hiding this link is not the security
  // boundary, just avoids showing a normal user a link to a page they'd
  // get a 404 from anyway.
  const [admin, plan] = await Promise.all([isAdmin(), getUserPlan()]);

  return (
    <header className="flex items-center justify-between border-b px-4 py-2.5 sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Logo className="size-6" />
        Voice Workspace
      </Link>
      <div className="flex items-center gap-1">
        {plan === "starter" && (
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-violet-600 hover:bg-violet-50"
          >
            <Sparkles className="size-4" />
            Upgrade
          </Link>
        )}
        {admin && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldCheck className="size-4" />
            Admin
          </Link>
        )}
        <UserMenu email={user.email ?? ""} />
      </div>
    </header>
  );
}
