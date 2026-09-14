"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";
import type { ProjectInvitation, ProjectMember } from "@/types";

interface AccessData {
  isOwner: boolean;
  owner: { id: string; email: string | null };
  members: (ProjectMember & { email: string | null })[];
  pendingInvitations: ProjectInvitation[];
  seatUsage: number;
  seatLimit: number;
}

function PersonRow({
  email,
  label,
  onRemove,
  removing,
}: {
  email: string | null;
  label?: string;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate">{email ?? "(unknown)"}</p>
        {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
      </div>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove"
          onClick={onRemove}
          disabled={removing}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function ShareProjectDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AccessData | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/access`);
      if (!res.ok) throw new Error("Failed to load Project access.");
      setData(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Project access.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(body, "Failed to send the invitation."));
      }
      toast.success(`Invited ${email}`);
      setEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send the invitation.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    setBusyId(invitationId);
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations/${invitationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke the invitation.");
      toast.success("Invitation revoked");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke the invitation.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveMember(memberUserId: string) {
    setBusyId(memberUserId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberUserId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove the member.");
      toast.success("Member removed");
      router.refresh();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the member.");
    } finally {
      setBusyId(null);
    }
  }

  const seatsFull = data ? data.seatUsage >= data.seatLimit : false;
  const collaborationAvailable = data ? data.seatLimit > 1 : true;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="size-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>Manage who can see and work on this Project.</DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Owner</Label>
              <PersonRow email={data.owner.email} />
            </div>

            {data.members.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Members</Label>
                <div className="flex flex-col gap-1.5">
                  {data.members.map((m) => (
                    <PersonRow
                      key={m.id}
                      email={m.email}
                      onRemove={() => handleRemoveMember(m.user_id)}
                      removing={busyId === m.user_id}
                    />
                  ))}
                </div>
              </div>
            )}

            {data.pendingInvitations.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Pending invitations</Label>
                <div className="flex flex-col gap-1.5">
                  {data.pendingInvitations.map((inv) => (
                    <PersonRow
                      key={inv.id}
                      email={inv.email}
                      label="Pending"
                      onRemove={() => handleRevoke(inv.id)}
                      removing={busyId === inv.id}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Seats {data.seatUsage} / {data.seatLimit} used
            </p>

            {!collaborationAvailable ? (
              <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5">
                <p className="text-sm text-muted-foreground">Project collaboration is available on Pro.</p>
                <Button asChild size="sm" className="w-fit">
                  <Link href="/upgrade">Upgrade to Pro</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-2">
                <Label htmlFor="invite-email">Invite member</Label>
                <div className="flex gap-2">
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="min-w-0 flex-1"
                    disabled={seatsFull}
                  />
                  <Button type="submit" disabled={!email.trim() || inviting || seatsFull}>
                    {inviting ? "Sending..." : "Send Invitation"}
                  </Button>
                </div>
                {seatsFull && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve used all {data.seatLimit} seats included in your plan.{" "}
                    <Link href="/upgrade" className="underline underline-offset-2">
                      Upgrade to Pro
                    </Link>{" "}
                    for more.
                  </p>
                )}
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
