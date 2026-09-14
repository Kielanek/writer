"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import type { PlanConfig } from "@/lib/admin/planConfig";

function PlanConfigCard({
  config,
  saved,
  onSaved,
  usagePeriodLabel,
}: {
  config: PlanConfig;
  saved: PlanConfig;
  onSaved: (next: PlanConfig) => void;
  usagePeriodLabel: string;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);

  const reducingALimit =
    draft.maxProjects < saved.maxProjects ||
    draft.aiActionsLimit < saved.aiActionsLimit ||
    draft.transcriptionMinutesLimit < saved.transcriptionMinutesLimit;

  function update<K extends keyof PlanConfig>(key: K, value: PlanConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/plan-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, `Failed to update ${draft.displayName} settings.`));
      }
      const next = await res.json();
      setDraft(next);
      onSaved(next);
      toast.success(`${next.displayName} settings updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update plan settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{draft.displayName}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {usagePeriodLabel} Changes apply immediately to every current {draft.displayName} account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-displayName`}>Display name</Label>
          <Input
            id={`${draft.planId}-displayName`}
            value={draft.displayName}
            onChange={(e) => update("displayName", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-maxProjects`}>Projects</Label>
          <Input
            id={`${draft.planId}-maxProjects`}
            type="number"
            min={1}
            value={draft.maxProjects}
            onChange={(e) => update("maxProjects", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-aiActionsLimit`}>AI Actions{draft.planId === "pro" ? " / month" : ""}</Label>
          <Input
            id={`${draft.planId}-aiActionsLimit`}
            type="number"
            min={1}
            value={draft.aiActionsLimit}
            onChange={(e) => update("aiActionsLimit", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-transcriptionMinutesLimit`}>
            Transcription (minutes{draft.planId === "pro" ? " / month" : ""})
          </Label>
          <Input
            id={`${draft.planId}-transcriptionMinutesLimit`}
            type="number"
            min={0}
            value={draft.transcriptionMinutesLimit}
            onChange={(e) => update("transcriptionMinutesLimit", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-monthlyPricePln`}>Monthly price (PLN)</Label>
          <Input
            id={`${draft.planId}-monthlyPricePln`}
            type="number"
            min={0}
            step={1}
            value={draft.monthlyPricePln}
            onChange={(e) => update("monthlyPricePln", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-seatLimit`}>Seats (owner + collaborators)</Label>
          <Input
            id={`${draft.planId}-seatLimit`}
            type="number"
            min={1}
            value={draft.seatLimit}
            onChange={(e) => update("seatLimit", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${draft.planId}-apiCostBudgetUsd`}>Internal API Cost Cap (USD)</Label>
          <Input
            id={`${draft.planId}-apiCostBudgetUsd`}
            type="number"
            min={0.01}
            step={0.01}
            value={draft.apiCostBudgetUsd ?? ""}
            placeholder="No cap"
            onChange={(e) => update("apiCostBudgetUsd", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Internal API Cost Cap is never shown to users — Admin only. Leave blank for no cap.
      </p>

      {reducingALimit && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          You&apos;re reducing a limit below its current value. Some existing {draft.displayName} users may
          immediately exceed the new limit.
        </p>
      )}

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export function PlanSettingsForm({ initialConfigs }: { initialConfigs: { starter: PlanConfig; pro: PlanConfig } }) {
  const [configs, setConfigs] = useState(initialConfigs);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Plan Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Starter and Pro limits are stored in the database and take effect immediately — no deploy needed.
        </p>
      </div>

      <PlanConfigCard
        config={configs.starter}
        saved={configs.starter}
        usagePeriodLabel="Starter usage is lifetime — it never resets on its own."
        onSaved={(next) => setConfigs((prev) => ({ ...prev, starter: next }))}
      />
      <PlanConfigCard
        config={configs.pro}
        saved={configs.pro}
        usagePeriodLabel="Pro usage resets every calendar month."
        onSaved={(next) => setConfigs((prev) => ({ ...prev, pro: next }))}
      />
    </div>
  );
}
