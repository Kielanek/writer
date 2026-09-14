import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminDashboardSummary } from "@/lib/admin/users";
import { withApiErrorHandling } from "@/lib/utils/api";

export const GET = withApiErrorHandling(async () => {
  await requireAdmin();
  const summary = await getAdminDashboardSummary();
  return NextResponse.json(summary);
});
