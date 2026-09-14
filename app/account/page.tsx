import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthedUser } from "@/lib/supabase/auth";
import { getUserEntitlements } from "@/lib/entitlements/usage";
import { getUserPlan } from "@/lib/entitlements/profile";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { getOwnerSeatUsage } from "@/lib/db/collaboration";
import { UsagePanel } from "@/components/account/usage-panel";
import { CollaborationSummary } from "@/components/account/collaboration-summary";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [user, entitlements, planId] = await Promise.all([
    getAuthedUser(),
    getUserEntitlements(),
    getUserPlan(),
  ]);

  const [seatLimit, seatUsage] = await Promise.all([
    getPlanLimits(planId).then((l) => l.seatLimit),
    user ? getOwnerSeatUsage(user.id) : Promise.resolve(1),
  ]);

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

      <CollaborationSummary seatUsage={seatUsage} seatLimit={seatLimit} />
    </main>
  );
}
