import { NextRequest, NextResponse } from "next/server";
import { createPreset, listPresetsForType } from "@/lib/writing-engine/customPresets/service";
import { createPresetSchema, documentTypeSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const documentTypeParam = request.nextUrl.searchParams.get("documentType");
  const parsed = documentTypeSchema.safeParse(documentTypeParam);
  if (!parsed.success) throw new ApiError(400, "A valid documentType query parameter is required.");

  const presets = await listPresetsForType(parsed.data);
  return NextResponse.json(presets);
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const input = createPresetSchema.parse(body);

  const preset = await createPreset(input);
  return NextResponse.json({ preset }, { status: 201 });
});
