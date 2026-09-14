import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { getAdminDashboardSummary, listAdminUsers } from "@/lib/admin/users";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { getAllPlanConfigs } from "@/lib/admin/planConfig";
import { DashboardSummary } from "@/components/admin/dashboard-summary";
import { PlanSettingsForm } from "@/components/admin/plan-settings-form";
import { UsersTable, type AdminUserRow } from "@/components/admin/users-table";

export const dynamic = "force-dynamic";

const USERS_PER_PAGE = 25;

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  const [summary, planConfigs, firstPage] = await Promise.all([
    getAdminDashboardSummary(),
    getAllPlanConfigs(),
    listAdminUsers({ page: 1, perPage: USERS_PER_PAGE }),
  ]);

  const initialUsers: AdminUserRow[] = await Promise.all(
    firstPage.users.map(async (user) => ({ ...user, entitlements: await getEntitlementsForUser(user) }))
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan configuration and registered users. Visible only to authorized admin accounts.
        </p>
      </div>

      <DashboardSummary summary={summary} />

      <PlanSettingsForm initialConfigs={planConfigs} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Users</h2>
        <UsersTable initialUsers={initialUsers} initialTotal={firstPage.total} />
      </div>
    </main>
  );
}
