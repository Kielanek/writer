"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";

/**
 * DEMO CHECKOUT ONLY — see app/api/upgrade/demo-checkout/route.ts. There is
 * no card input anywhere in this component on purpose: the "demo card" below
 * is a fixed, read-only label, never a form field, so there is no real or
 * fake card data to collect, hold in state, log, or send anywhere.
 */
export function DemoCheckoutDialog({
  monthlyPricePln,
  onUpgraded,
}: {
  monthlyPricePln: number | null;
  onUpgraded: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/upgrade/demo-checkout", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to complete the demo upgrade."));
      }
      setOpen(false);
      onUpgraded();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete the demo upgrade.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upgrade to Pro</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demo Checkout</DialogTitle>
          <DialogDescription>
            This is a demo. No real payment will be processed.
            {monthlyPricePln ? ` Pro is ${monthlyPricePln} PLN / month in this demo.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Payment method</p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <CreditCard className="size-4 text-muted-foreground" />
            <span>Demo card ending in 4242</span>
          </div>
          <p className="text-xs text-muted-foreground">
            No real card is charged or stored — this button only flips your account to Pro for demo
            purposes.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Confirming..." : "Confirm Demo Upgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
