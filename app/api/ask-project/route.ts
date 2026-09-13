import { NextRequest, NextResponse } from "next/server";
import { createChatMessage, listChatMessages } from "@/lib/db/chat";
import { buildProjectContext, ProjectContextError, ProjectNotFoundError } from "@/lib/context/buildProjectContext";
import { buildAskProjectPrompt } from "@/lib/ai/prompts/askProject";
import { generateText, AiGenerationError } from "@/lib/ai/generateText";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

/**
 * "Ask Project" — a chat grounded ONLY in the current Project's Notes and
 * this Project's own chat history (never other projects, never documents).
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
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

  const history = await listChatMessages(input.projectId);

  const userMessage = await createChatMessage({
    projectId: input.projectId,
    role: "user",
    content: input.message,
  });

  let answer: string;
  try {
    const { system, prompt } = buildAskProjectPrompt({
      context,
      history,
      question: input.message,
    });
    answer = await generateText({ system, prompt, temperature: 0.5 });
  } catch (err) {
    if (err instanceof AiGenerationError) throw new ApiError(502, err.message);
    throw err;
  }

  const assistantMessage = await createChatMessage({
    projectId: input.projectId,
    role: "assistant",
    content: answer,
  });

  return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
});
