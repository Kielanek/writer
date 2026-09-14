"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import type { ProjectInvitation } from "@/types";

type InvitationItem = ProjectInvitation & { projectName: string; invitedByEmail: string | null };

export function InvitationsList({ initialInvitations }: { initialInvitations: InvitationItem[] }) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initialInvitations);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/invitations/${id}/accept`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to accept the invitation."));
      }
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invitation accepted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept the invitation.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/invitations/${id}/decline`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to decline the invitation."));
      }
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invitation declined");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline the invitation.");
    } finally {
      setBusyId(null);
    }
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Mail className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">No pending invitations.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {invitations.map((inv) => (
        <div key={inv.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <p className="text-sm">
            {inv.invitedByEmail ?? "Someone"} invited you to: <span className="font-semibold">{inv.projectName}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busyId === inv.id} onClick={() => handleAccept(inv.id)}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busyId === inv.id} onClick={() => handleDecline(inv.id)}>
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
