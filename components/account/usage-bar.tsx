import { cn } from "cn";

/**
 * < 75% normal, 75-90% subtle warning, > 90% stronger warning — never
 * alarming red until usage is actually near/exceeded.
 */
function barColor(ratio: number): string {
  if (ratio >= 0.9) return "bg-destructive";
  if (ratio >= 0.75) return "bg-amber-500";
  return "bg-primary";
}

export function UsageBar({
  label,
  used,
  limit,
  formatValue = (v) => `${v}`,
}: {
  label: string;
  used: number;
  limit: number;
  formatValue?: (value: number) => string;
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatValue(used)} / {formatValue(limit)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor(ratio))}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
