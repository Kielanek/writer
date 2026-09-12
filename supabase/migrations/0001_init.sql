-- Voice-first AI content workspace — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  type text not null check (type in ('recording', 'audio_upload', 'text')),
  title text not null default '',
  description text not null default '',
  content text not null default '',
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_project_id_idx on notes (project_id);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  type text not null check (
    type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'summary')
  ),
  title text not null default '',
  creation_instructions text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_project_id_idx on documents (project_id);

-- ---------------------------------------------------------------------------
-- document_versions
-- ---------------------------------------------------------------------------
create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version_number integer not null,
  content text not null default '',
  source text not null check (source in ('initial', 'ai_edit', 'manual', 'restore')),
  instruction text,
  restored_from_version integer,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists document_versions_document_id_idx on document_versions (document_id);

-- Transactionally-safe version numbering: always call this instead of
-- computing max(version_number)+1 in application code, to avoid races.
create or replace function create_document_version(
  p_document_id uuid,
  p_content text,
  p_source text,
  p_instruction text default null,
  p_restored_from_version integer default null
) returns document_versions
language plpgsql
as $$
declare
  v_next_version integer;
  v_row document_versions;
begin
  -- Lock the parent document row to serialize concurrent version creation.
  perform 1 from documents where id = p_document_id for update;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from document_versions
    where document_id = p_document_id;

  insert into document_versions (
    document_id, version_number, content, source, instruction, restored_from_version
  ) values (
    p_document_id, v_next_version, p_content, p_source, p_instruction, p_restored_from_version
  )
  returning * into v_row;

  update documents set content = p_content, updated_at = now() where id = p_document_id;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- project_chat_messages
-- ---------------------------------------------------------------------------
create table if not exists project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists project_chat_messages_project_id_idx on project_chat_messages (project_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on projects;
create trigger set_updated_at before update on projects
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on notes;
create trigger set_updated_at before update on notes
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on documents;
create trigger set_updated_at before update on documents
  for each row execute function set_updated_at();
