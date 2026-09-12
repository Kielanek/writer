"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".mp3,.m4a,.wav,.webm,.ogg,audio/*";

export function UploadAudioDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setError(null);

    if (selected && selected.size > MAX_AUDIO_FILE_BYTES) {
      setError("This file is too large. Maximum size is 25 MB.");
      setFile(null);
      return;
    }

    setFile(selected);
  }

  async function handleUpload() {
    if (!file || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("projectId", projectId);
      formData.append("noteType", "audio_upload");

      const res = await fetch("/api/transcription", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to process the audio file.");
      }

      toast.success("Note created");
      setFile(null);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process the audio file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't allow the dialog to be dismissed mid-upload — the note would
        // be saved with no visible confirmation and no way to see it failed.
        if (!next && submitting) return;
        setOpen(next);
        if (!next) {
          setFile(null);
          setError(null);
        }
      }}
    >
      <Button
        variant="outline"
        className="h-11 w-full justify-start gap-2.5 text-sm font-medium"
        onClick={() => setOpen(true)}
      >
        <Upload className="size-4" />
        Upload Audio
      </Button>

      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Upload Audio</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileChange}
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />

          <p className="text-xs text-muted-foreground">
            Supported formats: mp3, m4a, wav, webm, ogg. Max size 25 MB.
          </p>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button onClick={handleUpload} disabled={!file || submitting} className="w-full">
            {submitting ? "Transcribing..." : "Upload & Transcribe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
