import { NextRequest, NextResponse } from "next/server";
import { deleteProject, getProject, updateProject } from "@/lib/db/projects";
import { updateProjectSchema, uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  const project = await getProject(projectId);
  if (!project) throw new ApiError(404, "Project not found.");

  return NextResponse.json({ project });
});

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  const body = await request.json();
  const input = updateProjectSchema.parse(body);

  const existing = await getProject(projectId);
  if (!existing) throw new ApiError(404, "Project not found.");

  const project = await updateProject(projectId, {
    name: input.name,
    description: input.description === undefined ? undefined : input.description,
  });

  return NextResponse.json({ project });
});

export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  uuidSchema.parse(projectId);

  const existing = await getProject(projectId);
  if (!existing) throw new ApiError(404, "Project not found.");

  await deleteProject(projectId);
  return NextResponse.json({ ok: true });
});
