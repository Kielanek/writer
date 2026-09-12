-- Writing Engine: custom presets + preset/SEO tracking on documents.
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- writing_presets (custom presets only — built-in presets live in code,
-- see lib/writing-engine/registry.ts, and are never stored here)
-- ---------------------------------------------------------------------------
create table if not exists writing_presets (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (
    document_type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'summary')
  ),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  rules jsonb not null default '[]'::jsonb,
  avoid_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists writing_presets_document_type_idx on writing_presets (document_type);

drop trigger if exists set_updated_at on writing_presets;
create trigger set_updated_at before update on writing_presets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- documents: track which preset (and SEO setting) generated each Document.
-- preset_snapshot is a frozen copy of the preset's rules at generation time —
-- the source of truth for prompts, never the live preset (which may later
-- be edited or deleted). preset_id is kept alongside only for reference/
-- debugging (e.g. the Prompt Inspector), not for lookups.
-- ---------------------------------------------------------------------------
alter table documents
  add column if not exists preset_id text,
  add column if not exists preset_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists writing_engine_version integer not null default 1,
  add column if not exists seo_enabled boolean not null default false;
