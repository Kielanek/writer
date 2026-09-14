import { NextRequest, NextResponse } from "next/server";
import { createNote } from "@/lib/db/notes";
import { getProject } from "@/lib/db/projects";
import { generateNoteMetadata } from "@/lib/ai/noteMetadata";
import { createTextNoteSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";

/** Creates a manual text Note: generates title + description, then saves. Any collaborator can add Notes to a shared Project; the (uncounted, but real-cost) metadata generation is billed to the Project Owner. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const actor = await requireUser();
  const body = await request.json();
  const input = createTextNoteSchema.parse(body);

  const project = await getProject(input.projectId);
  if (!project) throw new ApiError(404, "Project not found.");

  const billing = { billingUserId: project.owner_id, actorUserId: actor.id, projectId: project.id };

  const metadata = await generateNoteMetadata(input.content, billing);

  const note = await createNote({
    projectId: input.projectId,
    type: "text",
    title: metadata.title,
    description: metadata.description,
    content: input.content,
  });

  return NextResponse.json({ note }, { status: 201 });
});
