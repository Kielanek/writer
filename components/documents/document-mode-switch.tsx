import { cn } from "cn";

export type DocumentViewMode = "edit" | "preview";

/**
 * LinkedIn has no Edit/Preview switch at all (it's edited directly inside
 * its final-form composer), so DocumentWorkspace never reads `mode` for
 * linkedin_post. Every other type now opens in Preview by default.
 */
export function defaultDocumentViewMode(): DocumentViewMode {
  return "preview";
}

const MODES: { value: DocumentViewMode; label: string }[] = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview" },
];

export function DocumentModeSwitch({
  mode,
  onChange,
}: {
  mode: DocumentViewMode;
  onChange: (mode: DocumentViewMode) => void;
}) {
  return (
    <div className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-1" role="tablist">
      {MODES.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={mode === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "min-h-9 rounded-md px-4 text-sm font-medium transition-colors",
            mode === item.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
