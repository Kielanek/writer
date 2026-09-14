"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlanStatusBadge } from "@/components/admin/plan-status-badge";
import { formatShortDate, formatDateTime } from "@/lib/utils/format";
import type { AdminUserSummary } from "@/lib/admin/users";
import type { UserEntitlements } from "@/lib/entitlements/usage";

export type AdminUserRow = AdminUserSummary & { entitlements: UserEntitlements };

const PER_PAGE = 25;

/**
 * Initial page is server-rendered (see app/admin/page.tsx) — this only
 * fetches client-side in response to an explicit user action (search
 * submit, pagination click), never automatically on mount/state-change, to
 * match this app's existing convention of server-first data loading.
 */
export function UsersTable({ initialUsers, initialTotal }: { initialUsers: AdminUserRow[]; initialTotal: number }) {
  const [rows, setRows] = useState(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchPage(nextPage: number, search: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), perPage: String(PER_PAGE) });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setRows(data.users ?? []);
      setTotal(data.total ?? 0);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput);
    fetchPage(1, searchInput);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearchSubmit} className="flex max-w-xs gap-2">
        <Input
          placeholder="Search by email or user ID..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={loading}>
          Search
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Projects</th>
              <th className="px-3 py-2 font-medium">AI Actions</th>
              <th className="px-3 py-2 font-medium">Transcription</th>
              <th className="px-3 py-2 font-medium">API Cost</th>
              <th className="px-3 py-2 font-medium">Last Sign In</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {loading ? "Loading..." : "No users found."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${row.id}`} className="font-medium hover:underline">
                    {row.email ?? row.id}
                  </Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {formatShortDate(row.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <PlanStatusBadge planId={row.planId} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {row.entitlements.projects.used} / {row.entitlements.projects.limit}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {row.entitlements.aiActions.used} / {row.entitlements.aiActions.limit}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {row.entitlements.transcriptionMinutes.used} / {row.entitlements.transcriptionMinutes.limit} min
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {row.entitlements.providerCost
                    ? `$${row.entitlements.providerCost.usedUsd.toFixed(4)} / $${row.entitlements.providerCost.limitUsd.toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {row.lastSignInAt ? formatDateTime(row.lastSignInAt) : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} user{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => fetchPage(page - 1, appliedSearch)}
          >
            Previous
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => fetchPage(page + 1, appliedSearch)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
