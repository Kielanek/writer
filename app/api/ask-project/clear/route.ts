import { NextRequest, NextResponse } from "next/server";
import { clearChatMessages } from "@/lib/db/chat";
import { getProject } from "@/lib/db/projects";
import { uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { z } from "zod";

const clearChatSchema = z.object({ projectId: uuidSchema });

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const { projectId } = clearChatSchema.parse(body);

  const project = await getProject(projectId);
  if (!project) throw new ApiError(404, "Project not found.");

  await clearChatMessages(projectId);
  return NextResponse.json({ ok: true });
});
