import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { getAdminUserDetail, getAdminUserContentCounts, getAdminUserSeatUsage } from "@/lib/admin/users";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { getPlanLimits } from "@/lib/entitlements/plans";
import { PlanStatusBadge } from "@/components/admin/plan-status-badge";
import { SetPlanControl } from "@/components/admin/set-plan-control";
import { formatDateTime, formatShortDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { userId } = await params;
  const user = await getAdminUserDetail(userId);
  if (!user) notFound();

  const [entitlements, counts, seatUsage, planLimits] = await Promise.all([
    getEntitlementsForUser(user),
    getAdminUserContentCounts(userId),
    getAdminUserSeatUsage(userId),
    getPlanLimits(user.planId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Admin
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{user.email ?? "(no email)"}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{user.id}</p>
        </div>
        <PlanStatusBadge planId={user.planId} />
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:p-5">
        <div>
          <p className="text-xs text-muted-foreground">Account Created</p>
          <p>{formatDateTime(user.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Last Sign In</p>
          <p>{user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "Never"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Plan Changed</p>
          <p>{user.planChangedAt ? formatShortDate(user.planChangedAt) : "—"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-muted-foreground">Usage</h2>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Projects</dt>
            <dd className="tabular-nums">
              {entitlements.projects.used} / {entitlements.projects.limit}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">AI Actions</dt>
            <dd className="tabular-nums">
              {entitlements.aiActions.used} / {entitlements.aiActions.limit}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Transcription</dt>
            <dd className="tabular-nums">
              {entitlements.transcriptionMinutes.used} / {entitlements.transcriptionMinutes.limit} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Internal Provider Cost</dt>
            <dd className="tabular-nums">
              {entitlements.providerCost
                ? `$${entitlements.providerCost.usedUsd.toFixed(4)} / $${entitlements.providerCost.limitUsd.toFixed(2)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Seats</dt>
            <dd className="tabular-nums">
              {seatUsage} / {planLimits.seatLimit}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          {entitlements.usagePeriod === "monthly"
            ? `AI Actions and Transcription reset ${entitlements.aiActions.resetsAt ? formatShortDate(entitlements.aiActions.resetsAt) : "next month"}.`
            : "AI Actions and Transcription are lifetime allowances for this plan — they never reset."}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-muted-foreground">Content (counts only)</h2>
        <div className="flex gap-6 text-sm">
          <span>
            Projects: <span className="tabular-nums">{counts.projects}</span>
          </span>
          <span>
            Documents: <span className="tabular-nums">{counts.documents}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-muted-foreground">Set Plan</h2>
        <SetPlanControl userId={user.id} currentPlanId={user.planId} />
      </div>
    </main>
  );
}
