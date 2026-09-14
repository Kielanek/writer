"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoCheckoutDialog } from "@/components/upgrade/demo-checkout-dialog";
import { cn } from "cn";
import type { PlanId, PlanLimits } from "@/lib/entitlements/plans";

function Feature({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "violet" }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <Check className={cn("size-4 shrink-0", tone === "violet" ? "text-violet-500" : "text-primary")} />
      {children}
    </li>
  );
}

export function PlanComparison({
  currentPlan,
  starter,
  pro,
}: {
  currentPlan: PlanId;
  starter: PlanLimits;
  pro: PlanLimits;
}) {
  const [upgraded, setUpgraded] = useState(false);
  const effectivePlan = upgraded ? "pro" : currentPlan;

  if (upgraded) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">Upgrade successful</h2>
        <p className="text-sm text-muted-foreground">You are now on Pro.</p>
        <Button asChild>
          <a href="/account">Continue to app</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className={cn(effectivePlan === "starter" && "ring-2 ring-primary/40")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{starter.displayName}</CardTitle>
            {effectivePlan === "starter" && <Badge variant="secondary">Current Plan</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-2xl font-bold">Free</p>
          <ul className="flex flex-col gap-2">
            <Feature>{starter.maxProjects} Projects</Feature>
            <Feature>{starter.aiActionsLimit} AI Actions</Feature>
            <Feature>{starter.transcriptionMinutesLimit} min transcription</Feature>
            <Feature>{starter.seatLimit} seat (no collaborators)</Feature>
          </ul>
          <p className="text-xs text-muted-foreground">Lifetime allowances — no monthly reset, no time limit.</p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border-violet-100 bg-violet-50/30",
          effectivePlan === "pro" && "ring-2 ring-violet-300"
        )}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{pro.displayName}</CardTitle>
            {effectivePlan === "pro" ? (
              <Badge className="border-transparent bg-violet-100 text-violet-700">Current Plan</Badge>
            ) : (
              <Badge className="border-transparent bg-violet-100 text-violet-700">Recommended</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-2xl font-bold">
            {pro.monthlyPricePln ?? 0} PLN <span className="text-sm font-normal text-muted-foreground">/ month</span>
          </p>
          <ul className="flex flex-col gap-2">
            <Feature tone="violet">{pro.maxProjects} Projects</Feature>
            <Feature tone="violet">{pro.aiActionsLimit} AI Actions / month</Feature>
            <Feature tone="violet">{pro.transcriptionMinutesLimit} min transcription / month</Feature>
            <Feature tone="violet">{pro.seatLimit} seats — invite collaborators</Feature>
          </ul>
        </CardContent>
        {currentPlan === "starter" && (
          <CardFooter>
            <DemoCheckoutDialog monthlyPricePln={pro.monthlyPricePln} onUpgraded={() => setUpgraded(true)} />
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
