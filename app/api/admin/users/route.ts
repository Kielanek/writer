import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminUsers } from "@/lib/admin/users";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { withApiErrorHandling } from "@/lib/utils/api";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 50;

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(searchParams.get("perPage")) || DEFAULT_PER_PAGE));
  const search = searchParams.get("search")?.trim() || undefined;

  const { users, total } = await listAdminUsers({ page, perPage, search });

  // One entitlements computation per listed user, in parallel — see
  // lib/admin/entitlements.ts's doc comment on why this reuses the exact
  // same math as product enforcement rather than a separate Admin-only
  // calculation.
  const usersWithEntitlements = await Promise.all(
    users.map(async (user) => ({
      ...user,
      entitlements: await getEntitlementsForUser(user),
    }))
  );

  return NextResponse.json({ users: usersWithEntitlements, total, page, perPage });
});
