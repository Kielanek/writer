import { Badge } from "@/components/ui/badge";
import { UsageBar } from "@/components/account/usage-bar";
import { formatShortDate } from "@/lib/utils/format";
import type { UserEntitlements } from "@/lib/entitlements/usage";

const PLAN_LABELS: Record<UserEntitlements["plan"], string> = {
  development: "Development",
  trial: "Trial",
  pro: "Pro",
};

export function UsagePanel({
  entitlements,
}: {
  entitlements: Pick<
    UserEntitlements,
    "plan" | "trialStatus" | "trialEndsAt" | "projects" | "aiActions" | "transcriptionMinutes"
  >;
}) {
  const { plan, trialStatus, trialEndsAt, projects, aiActions, transcriptionMinutes } = entitlements;
  const isExpiredTrial = trialStatus === "expired";

  return (
    <div className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Current Plan</p>
          <p className="text-lg font-semibold">{PLAN_LABELS[plan] ?? plan}</p>
          {trialStatus === "trialing" && trialEndsAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">Trial ends {formatShortDate(trialEndsAt)}</p>
          )}
        </div>
        <Badge variant={isExpiredTrial ? "destructive" : "secondary"} className="text-xs">
          {isExpiredTrial ? "Trial ended" : "Plan upgrades are coming soon"}
        </Badge>
      </div>

      {isExpiredTrial && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Your trial has ended. You can still view your existing Projects, Notes, and Documents —
          new AI actions and Projects are paused. Upgrades are coming soon.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">Usage {trialStatus === "not_on_trial" ? "this month" : "this trial"}</p>

        <UsageBar label="Projects" used={projects.used} limit={projects.limit} />
        <UsageBar label="AI Actions" used={aiActions.used} limit={aiActions.limit} />
        <UsageBar
          label="Transcription"
          used={transcriptionMinutes.used}
          limit={transcriptionMinutes.limit}
          formatValue={(v) => `${v} min`}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {trialStatus === "not_on_trial"
          ? `AI Actions and Transcription reset on ${formatShortDate(aiActions.resetsAt)}. Projects are a standing limit — delete one to free up space.`
          : "AI Actions and Transcription are included for your whole trial period, not reset monthly. Projects are a standing limit — delete one to free up space."}
      </p>
    </div>
  );
}
