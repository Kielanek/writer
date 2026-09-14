import type { AdminDashboardSummary } from "@/lib/admin/users";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function DashboardSummary({ summary }: { summary: AdminDashboardSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Total Users" value={summary.totalUsers} />
      <StatTile label="Active Trials" value={summary.activeTrials} />
      <StatTile label="Expired Trials" value={summary.expiredTrials} />
      <StatTile label="New Today" value={summary.newUsersToday} />
    </div>
  );
}
