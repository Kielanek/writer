import { Users } from "lucide-react";

export function CollaborationSummary({ seatUsage, seatLimit }: { seatUsage: number; seatLimit: number }) {
  const collaborators = Math.max(0, seatUsage - 1);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Collaboration</p>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Seats</span>
        <span className="tabular-nums">
          {seatUsage} / {seatLimit}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Collaborators</span>
        <span className="tabular-nums">{collaborators}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Across every Project you own. Manage who has access from each Project&apos;s Share button.
      </p>
    </div>
  );
}
