import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminUserDetail, getAdminUserContentCounts } from "@/lib/admin/users";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export const GET = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  await requireAdmin();
  const { userId } = await params;

  const user = await getAdminUserDetail(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const [entitlements, counts] = await Promise.all([
    getEntitlementsForUser(user),
    getAdminUserContentCounts(userId),
  ]);

  return NextResponse.json({ user, entitlements, counts });
});
