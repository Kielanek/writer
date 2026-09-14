import { NextResponse } from "next/server";
import { declineProjectInvitation } from "@/lib/db/collaboration";
import { uuidSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ invitationId: string }>;
}

export const POST = withApiErrorHandling(async (_request, { params }: RouteParams) => {
  const { invitationId } = await params;
  uuidSchema.parse(invitationId);

  await declineProjectInvitation(invitationId);
  return NextResponse.json({ ok: true });
});
