import Link from "next/link";
import { Mic } from "lucide-react";
import { getAuthedUser } from "@/lib/supabase/auth";
import { UserMenu } from "@/components/auth/user-menu";

/** Renders nothing for signed-out visitors (e.g. on /login, /signup). */
export async function SiteHeader() {
  const user = await getAuthedUser();
  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b px-4 py-2.5 sm:px-6">
      <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        <Mic className="size-4" />
        Voice Workspace
      </Link>
      <UserMenu email={user.email ?? ""} />
    </header>
  );
}
