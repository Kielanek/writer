import { Badge } from "@/components/ui/badge";
import type { PlanId } from "@/lib/entitlements/plans";

const PLAN_LABELS: Record<PlanId, string> = {
  development: "Development",
  starter: "Starter",
  pro: "Pro",
};

/** Pro gets a soft accent tint (its own color, not the theme's monochrome default) — a small, deliberate highlight for the plan users pay for. */
const PLAN_CLASSNAMES: Record<PlanId, string> = {
  development: "",
  starter: "",
  pro: "border-transparent bg-violet-50 text-violet-600",
};

const PLAN_VARIANTS: Record<PlanId, "secondary" | "outline"> = {
  development: "outline",
  starter: "secondary",
  pro: "outline",
};

export function PlanStatusBadge({ planId }: { planId: PlanId }) {
  return (
    <Badge variant={PLAN_VARIANTS[planId] ?? "outline"} className={PLAN_CLASSNAMES[planId]}>
      {PLAN_LABELS[planId] ?? planId}
    </Badge>
  );
}
