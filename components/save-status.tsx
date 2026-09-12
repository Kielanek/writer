import { Loader2 } from "lucide-react";
import type { AutosaveStatus } from "@/hooks/use-autosave";

export function SaveStatus({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {status === "saving" && (
        <>
          <Loader2 className="size-3 animate-spin" />
          Saving...
        </>
      )}
      {status === "saved" && "Saved"}
      {status === "error" && <span className="text-destructive">Failed to save</span>}
    </span>
  );
}
