"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDateTime } from "@/lib/utils/format";
import type { DocumentVersion } from "@/types";

const SOURCE_LABELS: Record<DocumentVersion["source"], string> = {
  initial: "Initial generation",
  ai_edit: "AI edit",
  manual: "Manual version",
  restore: "Restored",
};

export function VersionHistory({
  versions,
  onRestore,
}: {
  versions: DocumentVersion[];
  onRestore: (version: DocumentVersion) => Promise<void>;
}) {
  const [previewVersion, setPreviewVersion] = useState<DocumentVersion | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <History className="size-4" />
        Version History
      </h2>

      <div className="flex flex-col gap-2">
        {versions.map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>v{version.version_number}</span>
                <span className="text-muted-foreground">
                  {SOURCE_LABELS[version.source]}
                  {version.source === "restore" && version.restored_from_version != null
                    ? ` from v${version.restored_from_version}`
                    : ""}
                </span>
              </div>
              {version.instruction ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  &ldquo;{version.instruction}&rdquo;
                </p>
              ) : null}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(version.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPreviewVersion(version)}>
                View
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRestoreTarget(version)}>
                Restore
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!previewVersion} onOpenChange={(open) => !open && setPreviewVersion(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              v{previewVersion?.version_number} — {previewVersion ? SOURCE_LABELS[previewVersion.source] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {previewVersion?.content}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (previewVersion) setRestoreTarget(previewVersion);
                setPreviewVersion(null);
              }}
            >
              Restore this version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title={`Restore v${restoreTarget?.version_number}?`}
        description="This will create a new version with this content. Your existing version history will be kept, not deleted."
        confirmLabel="Restore"
        destructive={false}
        onConfirm={async () => {
          if (restoreTarget) await onRestore(restoreTarget);
        }}
      />
    </section>
  );
}
