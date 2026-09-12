"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Eye, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CREATABLE_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/types";
import type { DocumentType } from "@/types";
import type { BuiltInPreset, CustomPresetRecord } from "@/lib/writing-engine/types";

type PresetsForType = { builtIn: BuiltInPreset[]; custom: CustomPresetRecord[] };

const DOCUMENT_TYPES: DocumentType[] = [...CREATABLE_DOCUMENT_TYPES];

interface ViewTarget {
  name: string;
  description: string | null;
  rules: string[];
  avoidRules: string[];
}

export function PresetsBrowser({
  presetsByType,
}: {
  presetsByType: Record<DocumentType, PresetsForType>;
}) {
  const router = useRouter();
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomPresetRecord | null>(null);

  async function handleDelete(preset: CustomPresetRecord) {
    try {
      const res = await fetch(`/api/writing-presets/${preset.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete preset.");
      }
      toast.success("Preset deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete preset.");
      throw err;
    }
  }

  return (
    <>
      <Tabs defaultValue={DOCUMENT_TYPES[0]}>
        <TabsList className="flex-wrap">
          {DOCUMENT_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>

        {DOCUMENT_TYPES.map((type) => {
          const { builtIn, custom } = presetsByType[type];
          return (
            <TabsContent key={type} value={type} className="flex flex-col gap-5">
              <Button asChild size="sm" className="self-start">
                <Link href={`/presets/${type}/new`}>
                  <Sparkles className="size-4" />
                  Create Writing Style
                </Link>
              </Button>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Built-in
                </h3>
                <div className="flex flex-col gap-2">
                  {builtIn.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{preset.label}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {preset.description}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="View preset"
                          onClick={() =>
                            setViewTarget({
                              name: preset.label,
                              description: preset.description,
                              rules: preset.rules,
                              avoidRules: preset.avoidRules,
                            })
                          }
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Duplicate & Customize" asChild>
                          <Link href={`/presets/${type}/new?duplicateFrom=${preset.id}&source=built_in`}>
                            <Copy className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your Presets
                </h3>
                {custom.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    No custom presets yet for {DOCUMENT_TYPE_LABELS[type]}.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {custom.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{preset.name}</div>
                          {preset.description ? (
                            <div className="truncate text-sm text-muted-foreground">
                              {preset.description}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="View preset"
                            onClick={() =>
                              setViewTarget({
                                name: preset.name,
                                description: preset.description,
                                rules: preset.rules,
                                avoidRules: preset.avoid_rules,
                              })
                            }
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Edit preset" asChild>
                            <Link href={`/presets/${type}/${preset.id}/edit`}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Duplicate & Customize" asChild>
                            <Link href={`/presets/${type}/new?duplicateFrom=${preset.id}&source=custom`}>
                              <Copy className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete preset"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(preset)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewTarget?.name}</DialogTitle>
          </DialogHeader>
          {viewTarget ? (
            <div className="flex flex-col gap-4 text-sm">
              {viewTarget.description ? (
                <p className="text-muted-foreground">{viewTarget.description}</p>
              ) : null}
              {viewTarget.rules.length > 0 ? (
                <div>
                  <div className="mb-1 font-medium">Writing Rules</div>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    {viewTarget.rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {viewTarget.avoidRules.length > 0 ? (
                <div>
                  <div className="mb-1 font-medium">Things to Avoid</div>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    {viewTarget.avoidRules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this preset?"
        description={`This will permanently delete "${deleteTarget?.name}". Documents already generated with it keep their own copy of these rules and are not affected.`}
        confirmLabel="Delete Preset"
        onConfirm={() => {
          if (deleteTarget) return handleDelete(deleteTarget);
        }}
      />
    </>
  );
}
