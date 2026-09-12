"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1000;

/**
 * Debounced autosave for a single value. Calls `onSave` ~1s after the value
 * stops changing. Does not save on mount, and skips saving if the value
 * hasn't actually changed from the last saved value.
 */
export function useAutosave<T>(value: T, onSave: (value: T) => Promise<void>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const savedValueRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (value === savedValueRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await onSaveRef.current(value);
        savedValueRef.current = value;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value]);

  return status;
}
