import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

let cachedClient: OpenAI | null = null;

/** Centralized OpenAI client. Never import this from client components. */
export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.openaiApiKey() });
  }
  return cachedClient;
}
