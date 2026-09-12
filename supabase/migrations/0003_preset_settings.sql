-- Guided Writing Preset Creator: adds structured questionnaire settings to
-- custom presets. Extends the existing writing_presets table rather than
-- creating a second preset table — id/document_type/name/description/rules/
-- avoid_rules are untouched.
--
-- Run this in the Supabase SQL editor after 0001_init.sql and 0002_writing_engine.sql.

alter table writing_presets
  add column if not exists settings jsonb;

-- No change to documents.preset_snapshot's column type (already jsonb) — it
-- simply gains an optional `settings` key going forward, frozen at
-- generation time. Existing snapshots without it keep working as-is via
-- lib/writing-engine/snapshot.ts's fallback handling.
