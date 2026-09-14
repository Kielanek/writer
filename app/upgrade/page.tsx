import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUserPlan } from "@/lib/entitlements/profile";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { PlanComparison } from "@/components/upgrade/plan-comparison";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  const [currentPlan, starter, pro] = await Promise.all([
    getUserPlan(),
    getPlanLimits("starter"),
    getPlanLimits("pro"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Account
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upgrade</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare plans. Upgrading is a demo — no real payment is processed.
        </p>
      </div>

      <PlanComparison currentPlan={currentPlan} starter={starter} pro={pro} />
    </main>
  );
}
