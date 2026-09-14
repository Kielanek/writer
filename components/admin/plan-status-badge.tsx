import { Badge } from "@/components/ui/badge";
import type { PlanId } from "@/lib/entitlements/plans";
import type { TrialStatus } from "@/lib/entitlements/trial";

const PLAN_LABELS: Record<PlanId, string> = {
  development: "Development",
  trial: "Trial",
  pro: "Pro",
};

export function PlanStatusBadge({ planId, trialStatus }: { planId: PlanId; trialStatus: TrialStatus }) {
  if (trialStatus === "expired") {
    return <Badge variant="destructive">Trial Expired</Badge>;
  }
  if (trialStatus === "trialing") {
    return <Badge variant="secondary">Trial Active</Badge>;
  }
  return <Badge variant="outline">{PLAN_LABELS[planId] ?? planId}</Badge>;
}
