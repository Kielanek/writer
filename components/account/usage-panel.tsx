import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageBar } from "@/components/account/usage-bar";
import { formatShortDate } from "@/lib/utils/format";
import type { UserEntitlements } from "@/lib/entitlements/usage";

export function UsagePanel({
  entitlements,
}: {
  entitlements: Pick<
    UserEntitlements,
    "plan" | "planDisplayName" | "usagePeriod" | "projects" | "aiActions" | "transcriptionMinutes"
  >;
}) {
  const { plan, planDisplayName, usagePeriod, projects, aiActions, transcriptionMinutes } = entitlements;

  const aiActionsExhausted = aiActions.remaining <= 0;
  const transcriptionExhausted = transcriptionMinutes.remaining <= 0;
  const projectsExhausted = projects.remaining <= 0;
  const anyLimitReached = aiActionsExhausted || transcriptionExhausted || projectsExhausted;

  return (
    <div className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="text-lg font-semibold">{planDisplayName}</p>
        </div>
        {plan === "starter" && <Badge variant="secondary">Free</Badge>}
        {plan === "pro" && <Badge className="border-transparent bg-violet-50 text-violet-600">Pro</Badge>}
      </div>

      {plan === "starter" && anyLimitReached && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5">
          <p className="text-sm text-muted-foreground">
            {aiActionsExhausted && "You've used all AI Actions available on Starter. "}
            {transcriptionExhausted && "You've used all transcription minutes available on Starter. "}
            {projectsExhausted && "You've reached your Starter project limit. "}
            Upgrade to Pro for higher limits.
          </p>
          <Button asChild size="sm" className="w-fit">
            <Link href="/upgrade">Upgrade to Pro</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          Usage {usagePeriod === "monthly" ? "this month" : ""}
        </p>

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
        {usagePeriod === "monthly"
          ? `AI Actions and Transcription reset on ${formatShortDate(aiActions.resetsAt ?? new Date().toISOString())}. Projects are a standing limit — delete one to free up space.`
          : "AI Actions and Transcription are lifetime allowances for the Starter plan — they never reset. Projects are a standing limit — delete one to free up space."}
      </p>

      {plan === "starter" && !anyLimitReached && (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/upgrade">Upgrade to Pro</Link>
        </Button>
      )}
    </div>
  );
}
