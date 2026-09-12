import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { documentTypeSchema, uuidSchema } from "@/lib/validation/schemas";
import { getCustomPreset } from "@/lib/db/writingPresets";
import { PresetWizard } from "@/components/presets/wizard/preset-wizard";
import { wizardStateFromCustomPreset } from "@/components/presets/wizard/wizard-types";

export const dynamic = "force-dynamic";

export default async function EditPresetPage({
  params,
}: {
  params: Promise<{ documentType: string; presetId: string }>;
}) {
  const { documentType, presetId } = await params;
  const parsedType = documentTypeSchema.safeParse(documentType);
  const parsedId = uuidSchema.safeParse(presetId);
  if (!parsedType.success || !parsedId.success) notFound();

  const preset = await getCustomPreset(presetId);
  if (!preset || preset.document_type !== parsedType.data) notFound();

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
        <h1 className="text-2xl font-bold tracking-tight">Edit Writing Style</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update how the AI should write for this document type.
        </p>
      </div>

      <PresetWizard
        documentType={parsedType.data}
        initialState={wizardStateFromCustomPreset(preset, parsedType.data)}
        existingPresetId={preset.id}
      />
    </main>
  );
}
