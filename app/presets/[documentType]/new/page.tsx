import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { documentTypeSchema } from "@/lib/validation/schemas";
import { getBuiltInPreset } from "@/lib/writing-engine/registry";
import { getCustomPreset } from "@/lib/db/writingPresets";
import { PresetWizard } from "@/components/presets/wizard/preset-wizard";
import {
  emptyWizardState,
  wizardStateFromBuiltInPreset,
  wizardStateFromDuplicatedCustomPreset,
} from "@/components/presets/wizard/wizard-types";

export const dynamic = "force-dynamic";

export default async function NewPresetPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentType: string }>;
  searchParams: Promise<{ duplicateFrom?: string; source?: string }>;
}) {
  const { documentType } = await params;
  const parsed = documentTypeSchema.safeParse(documentType);
  if (!parsed.success) notFound();

  const { duplicateFrom, source } = await searchParams;

  let initialState = emptyWizardState(parsed.data);
  if (duplicateFrom) {
    if (source === "built_in") {
      const builtIn = getBuiltInPreset(duplicateFrom);
      if (builtIn && builtIn.documentType === parsed.data) {
        initialState = wizardStateFromBuiltInPreset(builtIn);
      }
    } else {
      const custom = await getCustomPreset(duplicateFrom);
      if (custom && custom.document_type === parsed.data) {
        initialState = wizardStateFromDuplicatedCustomPreset(custom, parsed.data);
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/presets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Writing Presets
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Writing Style</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer a few questions about how you want the AI to write. No prompt engineering required.
        </p>
      </div>

      <PresetWizard documentType={parsed.data} initialState={initialState} />
    </main>
  );
}
