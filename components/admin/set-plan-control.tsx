"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import type { PlanId } from "@/lib/entitlements/plans";

const ASSIGNABLE_PLANS: Extract<PlanId, "trial" | "development">[] = ["trial", "development"];
const LABELS: Record<string, string> = { trial: "Trial", development: "Development" };

export function SetPlanControl({ userId, currentPlanId }: { userId: string; currentPlanId: PlanId }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function setPlan(planId: string) {
    if (saving || planId === currentPlanId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to change plan."));
      }
      toast.success(`Plan set to ${LABELS[planId]}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ASSIGNABLE_PLANS.map((planId) => (
        <Button
          key={planId}
          variant={planId === currentPlanId ? "default" : "outline"}
          size="sm"
          disabled={saving || planId === currentPlanId}
          onClick={() => setPlan(planId)}
        >
          {LABELS[planId]}
        </Button>
      ))}
      <p className="w-full text-xs text-muted-foreground">
        Setting to Trial starts a new trial period using the current trial duration setting.
        Setting to Development removes trial restrictions entirely.
      </p>
    </div>
  );
}
