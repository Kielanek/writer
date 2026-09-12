import type { ReactNode } from "react";

export function SectionHeader({
  id,
  title,
  count,
  action,
}: {
  id?: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div id={id} className="flex scroll-mt-20 items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {title}
        {count != null ? <span className="ml-1.5 text-muted-foreground">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}
