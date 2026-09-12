import { NextRequest, NextResponse } from "next/server";
import { duplicatePreset } from "@/lib/writing-engine/customPresets/service";
import { duplicatePresetSchema } from "@/lib/validation/schemas";
import { withApiErrorHandling } from "@/lib/utils/api";

/** Duplicates a built-in or custom preset into a brand-new, editable custom preset. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const input = duplicatePresetSchema.parse(body);

  const preset = await duplicatePreset(input);
  return NextResponse.json({ preset }, { status: 201 });
});
