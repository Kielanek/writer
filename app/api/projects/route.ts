import { NextRequest, NextResponse } from "next/server";
import { createProject, listMyProjectsWithCounts } from "@/lib/db/projects";
import { createProjectSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

/** Projects this account OWNS — see lib/db/projects.ts's listSharedProjectsWithCounts() for the "shared with me" counterpart (not exposed as a separate route yet; the Projects page fetches both server-side directly). */
export const GET = withApiErrorHandling(async () => {
  const projects = await listMyProjectsWithCounts();
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
