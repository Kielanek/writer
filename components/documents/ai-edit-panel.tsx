"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function AiEditPanel({
  onApply,
}: {
  onApply: (instruction: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!instruction.trim() || applying) return;

    setApplying(true);
    setError(null);
    try {
      await onApply(instruction.trim());
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply the AI edit.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <Label htmlFor="ai-edit-instruction" className="flex items-center gap-2">
        <Sparkles className="size-4 text-violet-500" />
        Ask AI to edit
      </Label>
      <Textarea
        id="ai-edit-instruction"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Make the introduction shorter and stronger. Keep the rest of the structure."
        rows={3}
        maxLength={5000}
        disabled={applying}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button onClick={handleApply} disabled={!instruction.trim() || applying} className="self-end">
        {applying ? "Applying changes..." : "Apply Edit"}
      </Button>
    </section>
  );
}
