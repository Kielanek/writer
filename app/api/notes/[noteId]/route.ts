import { NextRequest, NextResponse } from "next/server";
import { deleteNote, getNote, updateNote } from "@/lib/db/notes";
import { updateNoteSchema, uuidSchema } from "@/lib/validation/schemas";
import { ApiError, withApiErrorHandling } from "@/lib/utils/api";

interface RouteParams {
  params: Promise<{ noteId: string }>;
}

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { noteId } = await params;
  uuidSchema.parse(noteId);

  const note = await getNote(noteId);
  if (!note) throw new ApiError(404, "Note not found.");

  return NextResponse.json({ note });
});

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const { noteId } = await params;
  uuidSchema.parse(noteId);

  const body = await request.json();
  const input = updateNoteSchema.parse(body);

  const existing = await getNote(noteId);
  if (!existing) throw new ApiError(404, "Note not found.");

  const note = await updateNote(noteId, input);
  return NextResponse.json({ note });
});

export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const { noteId } = await params;
  uuidSchema.parse(noteId);

  const existing = await getNote(noteId);
  if (!existing) throw new ApiError(404, "Note not found.");

  await deleteNote(noteId);
  return NextResponse.json({ ok: true });
});
