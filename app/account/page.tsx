import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthedUser } from "@/lib/supabase/auth";
import { getUserEntitlements } from "@/lib/entitlements/usage";
import { UsagePanel } from "@/components/account/usage-panel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [user, entitlements] = await Promise.all([getAuthedUser(), getUserEntitlements()]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <UsagePanel entitlements={entitlements} />
    </main>
  );
}
