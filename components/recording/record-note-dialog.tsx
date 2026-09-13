"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, Square, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveApiErrorMessage } from "@/lib/utils/apiError";

type RecordingState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopped"
  | "submitting";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordNoteDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function reset() {
    stopTimer();
    stopStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    recordedBlobRef.current = null;
    setElapsed(0);
    setError(null);
    setState("idle");
  }

  function handleOpenChange(next: boolean) {
    // Don't allow the dialog to be dismissed mid-upload — the note would be
    // saved with no visible confirmation and no way to see it failed.
    if (!next && state === "submitting") return;
    setOpen(next);
    if (!next) reset();
  }

  async function startRecording() {
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't supported in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }

    setState("requesting-permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopStream();
      };

      recorder.start();
      setState("recording");
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setState("idle");
      setError(
        "Microphone access was denied. Please allow microphone access and try again."
      );
    }
  }

  function stopRecording() {
    stopTimer();
    mediaRecorderRef.current?.stop();
    setState("stopped");
  }

  function discardRecording() {
    reset();
  }

  async function submitRecording() {
    const blob = recordedBlobRef.current;
    if (!blob) return;

    setState("submitting");
    setError(null);

    try {
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording.${extension}`, { type: blob.type });

      const formData = new FormData();
      formData.append("audio", file);
      formData.append("projectId", projectId);
      formData.append("noteType", "recording");
      formData.append("durationSeconds", String(elapsed));

      const res = await fetch("/api/transcription", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(resolveApiErrorMessage(data, "Failed to save the recording."));
      }

      toast.success("Note created");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setState("stopped");
      setError(err instanceof Error ? err.message : "Failed to save the recording.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        className="h-11 w-full justify-start gap-2.5 text-sm font-medium"
        onClick={() => setOpen(true)}
      >
        <Mic className="size-4" />
        Record Note
      </Button>

      <DialogContent showCloseButton={state !== "submitting"}>
        <DialogHeader>
          <DialogTitle>Record Note</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6">
          <div
            className={`flex size-28 items-center justify-center rounded-full transition-colors ${
              state === "recording"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Mic className={`size-10 ${state === "recording" ? "animate-pulse" : ""}`} />
          </div>

          <div className="text-3xl font-mono tabular-nums">{formatElapsed(elapsed)}</div>

          {error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : null}

          <div className="flex w-full items-center justify-center gap-3">
            {(state === "idle" || state === "requesting-permission") && (
              <Button
                size="lg"
                className="h-14 flex-1 max-w-xs"
                onClick={startRecording}
                disabled={state === "requesting-permission"}
              >
                <Mic className="size-5" />
                {state === "requesting-permission" ? "Requesting mic..." : "Start Recording"}
              </Button>
            )}

            {state === "recording" && (
              <Button
                size="lg"
                variant="destructive"
                className="h-14 flex-1 max-w-xs"
                onClick={stopRecording}
              >
                <Square className="size-5" />
                Stop
              </Button>
            )}

            {state === "stopped" && (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14"
                  onClick={discardRecording}
                >
                  <X className="size-5" />
                  Discard
                </Button>
                <Button size="lg" className="h-14 flex-1" onClick={submitRecording}>
                  Save Note
                </Button>
              </>
            )}

            {state === "submitting" && (
              <Button size="lg" className="h-14 flex-1" disabled>
                Transcribing...
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
