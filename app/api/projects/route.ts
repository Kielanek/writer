import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjectsWithCounts } from "@/lib/db/projects";
import { createProjectSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

export const GET = withApiErrorHandling(async () => {
  const projects = await listProjectsWithCounts();
  return NextResponse.json({ projects });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const input = createProjectSchema.parse(body);

  const project = await createProject({
    name: input.name,
    description: input.description || null,
  });

  return NextResponse.json({ project }, { status: 201 });
});
