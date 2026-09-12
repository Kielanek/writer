import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listPresetsForType } from "@/lib/writing-engine/customPresets/service";
import { PresetsBrowser } from "@/components/presets/presets-browser";
import { CREATABLE_DOCUMENT_TYPES } from "@/types";
import type { DocumentType } from "@/types";

export const dynamic = "force-dynamic";

const DOCUMENT_TYPES: DocumentType[] = [...CREATABLE_DOCUMENT_TYPES];

export default async function PresetsPage() {
  const entries = await Promise.all(
    DOCUMENT_TYPES.map(async (type) => [type, await listPresetsForType(type)] as const)
  );
  const presetsByType = Object.fromEntries(entries) as Record<
    DocumentType,
    Awaited<ReturnType<typeof listPresetsForType>>
  >;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Writing Presets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define how the AI writes for each document type. Built-in presets can be duplicated
          into your own editable version.
        </p>
      </div>

      <PresetsBrowser presetsByType={presetsByType} />
    </main>
  );
}
