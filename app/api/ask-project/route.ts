import { NextRequest, NextResponse } from "next/server";
import { createChatMessage, listChatMessages } from "@/lib/db/chat";
import { buildProjectContext, ProjectContextError, ProjectNotFoundError } from "@/lib/context/buildProjectContext";
import { buildAskProjectPrompt } from "@/lib/ai/prompts/askProject";
import { AiGenerationError } from "@/lib/ai/generateText";
import { guardedGenerateText } from "@/lib/ai/guarded";
import { checkAiActionLimit, recordUsageEvent } from "@/lib/entitlements/usage";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";
import { requireUser } from "@/lib/supabase/auth";

/**
 * "Ask Project" — a chat grounded ONLY in the current Project's Notes and
 * this Project's own chat history (never other projects, never documents).
 * Any collaborator (Owner or Member) can use it; usage is billed to the
 * Project Owner regardless of who's asking.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const actor = await requireUser();
  const body = await request.json();
  const input = chatMessageSchema.parse(body);

  let context;
  try {
    context = await buildProjectContext(input.projectId);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) throw new ApiError(404, err.message);
    if (err instanceof ProjectContextError) throw new ApiError(422, err.message);
    throw err;
  }

  const billing = { billingUserId: context.project.owner_id, actorUserId: actor.id, projectId: input.projectId };

  // Checked before any side effect (including saving the user's own
  // message) — a blocked action should leave no partial chat history. The
  // provider-cost budget (guardedGenerateText, below) is the other half of
  // that same guarantee — both checks happen before anything is written.
  await checkAiActionLimit(billing.billingUserId);

  const history = await listChatMessages(input.projectId);

  let answer: string;
  try {
    const { system, prompt } = buildAskProjectPrompt({
      context,
      history,
      question: input.message,
    });
    const result = await guardedGenerateText("ask_project", { system, prompt, temperature: 0.5 }, billing);
    answer = result.text;
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }

  // Only written once generation has actually succeeded — an early failure
  // (limit, budget, or provider error) now leaves no orphaned user message
  // with no answer.
  const userMessage = await createChatMessage({
    projectId: input.projectId,
    role: "user",
    content: input.message,
  });
  const assistantMessage = await createChatMessage({
    projectId: input.projectId,
    role: "assistant",
    content: answer,
  });

  // Real provider cost for this call was already recorded by
  // guardedGenerateText as its own provider_cost event.
  await recordUsageEvent({
    eventType: "ai_action",
    quantity: 1,
    metadata: { feature: "ask_project" },
    billingUserId: billing.billingUserId,
    actorUserId: billing.actorUserId,
    projectId: billing.projectId,
  });

  return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
});
