import { Badge } from "@/components/ui/badge";
import { UsageBar } from "@/components/account/usage-bar";
import { formatShortDate } from "@/lib/utils/format";
import type { UserEntitlements } from "@/lib/entitlements/usage";

const PLAN_LABELS: Record<UserEntitlements["plan"], string> = {
  development: "Development",
  trial: "Trial",
  pro: "Pro",
};

export function UsagePanel({ entitlements }: { entitlements: UserEntitlements }) {
  const { plan, projects, aiActions, transcriptionMinutes } = entitlements;

  return (
    <div className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Current Plan</p>
          <p className="text-lg font-semibold">{PLAN_LABELS[plan] ?? plan}</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          Plan upgrades are coming soon
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">Usage this month</p>

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
        AI Actions and Transcription reset on {formatShortDate(aiActions.resetsAt)}. Projects are a
        standing limit — delete one to free up space.
      </p>
    </div>
  );
}
