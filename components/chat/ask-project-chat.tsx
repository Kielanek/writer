"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDateTime } from "@/lib/utils/format";
import type { ProjectChatMessage } from "@/types";

export function AskProjectChat({
  projectId,
  initialMessages,
}: {
  projectId: string;
  initialMessages: ProjectChatMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  async function handleAsk() {
    if (!question.trim() || asking) return;

    const pendingQuestion = question.trim();
    setQuestion("");
    setAsking(true);

    try {
      const res = await fetch("/api/ask-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: pendingQuestion }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get an answer.");
      }

      const { userMessage, assistantMessage } = await res.json();
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get an answer.");
      setQuestion(pendingQuestion);
    } finally {
      setAsking(false);
    }
  }

  async function handleClear() {
    try {
      const res = await fetch("/api/ask-project/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to clear chat.");
      }
      setMessages([]);
      toast.success("Chat cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear chat.");
      throw err;
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-end">
        {messages.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
            <Trash2 className="size-4" />
            Clear chat
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
            <MessageCircle className="size-6 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Ask anything about the notes in this Project.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col gap-1 rounded-xl p-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-muted"
                } max-w-[85%] whitespace-pre-wrap`}
              >
                {message.content}
                <span
                  className={`text-[10px] opacity-70 ${
                    message.role === "user" ? "self-end" : "self-start"
                  }`}
                >
                  {formatDateTime(message.created_at)}
                </span>
              </div>
            ))}
            {asking ? (
              <div className="self-start rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                Thinking...
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        className="sticky bottom-0 flex items-end gap-2 border-t bg-background pt-3"
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this project's notes..."
          rows={2}
          maxLength={5000}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!question.trim() || asking}>
          <Send className="size-4" />
        </Button>
      </form>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this project's chat?"
        description="This will permanently delete the Ask Project conversation for this project. This cannot be undone."
        confirmLabel="Clear Chat"
        onConfirm={handleClear}
      />
    </div>
  );
}
