import { NextResponse } from "next/server";
import { leaveProject } from "@/lib/db/collaboration";
import { uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/** A Member leaves a shared Project. The Owner cannot leave their own Project (leave_project() rejects it) — they'd need to delete it instead; ownership transfer isn't implemented yet. */
export const POST = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  await leaveProject(projectId);
  return NextResponse.json({ ok: true });
});
