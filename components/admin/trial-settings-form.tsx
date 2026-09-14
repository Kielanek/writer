"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import type { TrialConfig } from "@/lib/admin/planConfig";

export function TrialSettingsForm({ initialConfig }: { initialConfig: TrialConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [saved, setSaved] = useState(initialConfig);
  const [saving, setSaving] = useState(false);

  const reducingALimit =
    config.maxProjects < saved.maxProjects ||
    config.aiActionsLimit < saved.aiActionsLimit ||
    config.transcriptionMinutesLimit < saved.transcriptionMinutesLimit;

  function update<K extends keyof TrialConfig>(key: K, value: TrialConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/trial-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to update Trial settings."));
      }
      const next = await res.json();
      setConfig(next);
      setSaved(next);
      toast.success("Trial settings updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update Trial settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Trial Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Changes to Projects/AI Actions/Transcription apply immediately to every current trial
          account. Changing the trial duration only affects NEW signups — existing trial accounts
          keep their original end date.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trialDays">Trial duration (days)</Label>
          <Input
            id="trialDays"
            type="number"
            min={1}
            max={90}
            value={config.trialDays}
            onChange={(e) => update("trialDays", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxProjects">Projects</Label>
          <Input
            id="maxProjects"
            type="number"
            min={1}
            value={config.maxProjects}
            onChange={(e) => update("maxProjects", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aiActionsLimit">AI Actions</Label>
          <Input
            id="aiActionsLimit"
            type="number"
            min={1}
            value={config.aiActionsLimit}
            onChange={(e) => update("aiActionsLimit", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transcriptionMinutesLimit">Transcription (minutes)</Label>
          <Input
            id="transcriptionMinutesLimit"
            type="number"
            min={0}
            value={config.transcriptionMinutesLimit}
            onChange={(e) => update("transcriptionMinutesLimit", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="apiCostBudgetUsd">Internal API Cost Cap (USD)</Label>
          <Input
            id="apiCostBudgetUsd"
            type="number"
            min={0.01}
            step={0.01}
            value={config.apiCostBudgetUsd ?? ""}
            onChange={(e) => update("apiCostBudgetUsd", e.target.value === "" ? null : Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Maximum OpenAI provider cost allowed per trial account. Not shown to users.
          </p>
        </div>
      </div>

      {reducingALimit && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          You&apos;re reducing a limit below its current value. Some existing trial users may
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
