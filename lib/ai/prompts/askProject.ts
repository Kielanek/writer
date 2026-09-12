import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { ProjectChatMessage } from "@/types";

export interface GenerationPrompt {
  system: string;
  prompt: string;
}

/**
 * Builds the prompt for "Ask Project": a chat grounded ONLY in the current
 * Project's Notes and this Project's own chat history. Never receives notes,
 * documents, or chat history from other projects.
 */
export function buildAskProjectPrompt(input: {
  context: ProjectContext;
  history: ProjectChatMessage[];
  question: string;
}): GenerationPrompt {
  const { context, history, question } = input;

  const system = [
    "You are a helpful assistant answering questions about a content creator's notes inside one Project.",
    "Answer using ONLY the information in the Project Notes and the conversation so far.",
    "If the notes don't contain an answer, say so honestly instead of guessing.",
    "Do not invent facts, experiences, or opinions that are not present in the notes.",
    "Reply in the same language as the user's question, unless they ask otherwise.",
  ].join("\n");

  const historyText = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = [
    `Project name: ${context.project.name}`,
    context.project.description ? `Project description: ${context.project.description}` : null,
    "",
    "Project Notes:",
    context.notesText || "(No notes yet.)",
    "",
    history.length > 0 ? `Conversation so far:\n${historyText}` : null,
    "",
    `New question:\n${question}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}
