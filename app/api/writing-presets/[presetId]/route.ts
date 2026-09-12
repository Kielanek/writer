import { NextRequest, NextResponse } from "next/server";
import { deletePreset, updatePreset } from "@/lib/writing-engine/customPresets/service";
import { getBuiltInPreset } from "@/lib/writing-engine/registry";
import { getCustomPreset } from "@/lib/db/writingPresets";
import { updatePresetSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ presetId: string }>;
}

function assertNotBuiltIn(presetId: string) {
  if (getBuiltInPreset(presetId)) {
    throw new ApiError(403, "Built-in presets cannot be edited or deleted. Duplicate it to create an editable copy.");
  }
}

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { presetId } = await params;
  assertNotBuiltIn(presetId);

  const body = await request.json();
  const input = updatePresetSchema.parse(body);

  if (input.settings) {
    const existing = await getCustomPreset(presetId);
    if (!existing) throw new ApiError(404, "Preset not found.");
    if (input.settings.typeSpecific.documentType !== existing.document_type) {
      throw new ApiError(400, "Settings do not match this preset's document type.");
    }
  }

  const preset = await updatePreset(presetId, input);
  return NextResponse.json({ preset });
});

export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { presetId } = await params;
  assertNotBuiltIn(presetId);

  await deletePreset(presetId);
  return NextResponse.json({ ok: true });
});
