import { cn } from "cn";

const STEP_LABELS = ["Basics", "Voice", "Structure", "Rules", "Review"];

export function WizardProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((label, i) => {
        const index = i + 1;
        const state = index === step ? "current" : index < step ? "done" : "upcoming";
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "current" && "bg-foreground text-background",
                  state === "done" && "bg-foreground/80 text-background",
                  state === "upcoming" && "bg-muted text-muted-foreground"
                )}
              >
                {index}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length ? (
              <div className={cn("h-px flex-1 -translate-y-3", state === "upcoming" ? "bg-border" : "bg-foreground/40")} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
