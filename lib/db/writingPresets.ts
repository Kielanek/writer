import "server-only";
import { getSupabaseServerClient } from "@/lib/db/client";
import type { CustomPresetRecord } from "@/lib/writing-engine/types";
import type { DocumentType } from "@/types";

export async function listCustomPresets(documentType: DocumentType): Promise<CustomPresetRecord[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("writing_presets")
    .select("*")
    .eq("document_type", documentType)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCustomPreset(presetId: string): Promise<CustomPresetRecord | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("writing_presets")
    .select("*")
    .eq("id", presetId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createCustomPreset(input: {
  documentType: DocumentType;
  name: string;
  description: string | null;
  rules: string[];
  avoidRules: string[];
  settings?: CustomPresetRecord["settings"];
}): Promise<CustomPresetRecord> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("writing_presets")
    .insert({
      document_type: input.documentType,
      name: input.name,
      description: input.description,
      rules: input.rules,
      avoid_rules: input.avoidRules,
      settings: input.settings ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomPreset(
  presetId: string,
  input: {
    name?: string;
    description?: string | null;
    rules?: string[];
    avoidRules?: string[];
    settings?: CustomPresetRecord["settings"];
  }
): Promise<CustomPresetRecord> {
  const supabase = getSupabaseServerClient();
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.rules !== undefined) update.rules = input.rules;
  if (input.avoidRules !== undefined) update.avoid_rules = input.avoidRules;
  if (input.settings !== undefined) update.settings = input.settings;

  const { data, error } = await supabase
    .from("writing_presets")
    .update(update)
    .eq("id", presetId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCustomPreset(presetId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("writing_presets").delete().eq("id", presetId);
  if (error) throw error;
}
