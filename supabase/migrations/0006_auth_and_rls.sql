-- Multi-user Auth: ownership columns + Row Level Security.
--
-- This is a staged, backward-safe migration. Every existing row is
-- preserved — nothing is deleted, and nothing is made NOT NULL here.
-- Legacy rows simply have user_id = null until claimed (see
-- scripts/claim-legacy-data.ts), and RLS makes null-owner rows invisible
-- to everyone (including their original creator) until claimed — which is
-- the safe default, not a bug: better to hide legacy data than leak it
-- across accounts.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) after
-- 0005_remove_seo_article_type.sql.

-- ---------------------------------------------------------------------------
-- STEP A: nullable ownership columns on every user-owned table.
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table notes
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table documents
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table document_versions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table project_chat_messages
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table writing_presets
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- STEP B: indexes for ownership filtering. Every query in lib/db/*.ts
-- filters by user_id (usually alongside the existing project_id/document_id
-- index), so this is a plain single-column btree per table, not composite —
-- Postgres combines the two index scans efficiently via bitmap AND.
-- ---------------------------------------------------------------------------
create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists notes_user_id_idx on notes (user_id);
create index if not exists documents_user_id_idx on documents (user_id);
create index if not exists document_versions_user_id_idx on document_versions (user_id);
create index if not exists project_chat_messages_user_id_idx on project_chat_messages (user_id);
create index if not exists writing_presets_user_id_idx on writing_presets (user_id);

-- ---------------------------------------------------------------------------
-- STEP C: Row Level Security. Direct user_id ownership on every table
-- (rather than relationship/join-based policies through project_id) — see
-- the final report / README for why this was chosen for the MVP: it keeps
-- every policy a single indexed equality check, with no risk of a join
-- condition being subtly wrong, at the cost of one extra column per table.
-- ---------------------------------------------------------------------------
alter table projects enable row level security;
alter table notes enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table project_chat_messages enable row level security;
alter table writing_presets enable row level security;

-- projects ------------------------------------------------------------------
drop policy if exists projects_select_own on projects;
create policy projects_select_own on projects for select
  to authenticated using (user_id = auth.uid());

drop policy if exists projects_insert_own on projects;
create policy projects_insert_own on projects for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists projects_update_own on projects;
create policy projects_update_own on projects for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects for delete
  to authenticated using (user_id = auth.uid());

-- notes -----------------------------------------------------------------
drop policy if exists notes_select_own on notes;
create policy notes_select_own on notes for select
  to authenticated using (user_id = auth.uid());

drop policy if exists notes_insert_own on notes;
create policy notes_insert_own on notes for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists notes_update_own on notes;
create policy notes_update_own on notes for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notes_delete_own on notes;
create policy notes_delete_own on notes for delete
  to authenticated using (user_id = auth.uid());

-- documents -----------------------------------------------------------------
drop policy if exists documents_select_own on documents;
create policy documents_select_own on documents for select
  to authenticated using (user_id = auth.uid());

drop policy if exists documents_insert_own on documents;
create policy documents_insert_own on documents for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists documents_update_own on documents;
create policy documents_update_own on documents for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists documents_delete_own on documents;
create policy documents_delete_own on documents for delete
  to authenticated using (user_id = auth.uid());

-- document_versions -----------------------------------------------------
-- No update/delete policy: versions are immutable and append-only in this
-- product (restore creates a new version rather than mutating one), and the
-- app never issues an UPDATE/DELETE against this table directly.
drop policy if exists document_versions_select_own on document_versions;
create policy document_versions_select_own on document_versions for select
  to authenticated using (user_id = auth.uid());

drop policy if exists document_versions_insert_own on document_versions;
create policy document_versions_insert_own on document_versions for insert
  to authenticated with check (user_id = auth.uid());

-- project_chat_messages -------------------------------------------------
-- No update policy: chat messages are never edited, only created and
-- (via "Clear chat") deleted.
drop policy if exists project_chat_messages_select_own on project_chat_messages;
create policy project_chat_messages_select_own on project_chat_messages for select
  to authenticated using (user_id = auth.uid());

drop policy if exists project_chat_messages_insert_own on project_chat_messages;
create policy project_chat_messages_insert_own on project_chat_messages for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists project_chat_messages_delete_own on project_chat_messages;
create policy project_chat_messages_delete_own on project_chat_messages for delete
  to authenticated using (user_id = auth.uid());

-- writing_presets (custom presets only — built-in presets live in code and
-- are never rows in this table, so no policy is needed for them) ----------
drop policy if exists writing_presets_select_own on writing_presets;
create policy writing_presets_select_own on writing_presets for select
  to authenticated using (user_id = auth.uid());

drop policy if exists writing_presets_insert_own on writing_presets;
create policy writing_presets_insert_own on writing_presets for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists writing_presets_update_own on writing_presets;
create policy writing_presets_update_own on writing_presets for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists writing_presets_delete_own on writing_presets;
create policy writing_presets_delete_own on writing_presets for delete
  to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- create_document_version: must stamp the new version's user_id and refuse
-- to run against a Document the caller does not own. Runs SECURITY INVOKER
-- (the default — kept explicit here), so the `select ... for update` below
-- is itself subject to the documents_select_own RLS policy: if the caller
-- doesn't own the document, v_owner comes back null exactly as if the
-- document didn't exist, which is what we want (no existence disclosure).
-- ---------------------------------------------------------------------------
create or replace function create_document_version(
  p_document_id uuid,
  p_content text,
  p_source text,
  p_instruction text default null,
  p_restored_from_version integer default null
) returns document_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_version integer;
  v_row document_versions;
  v_owner uuid;
begin
  -- Lock the parent document row to serialize concurrent version creation,
  -- and (via RLS) learn its owner in the same step.
  select user_id into v_owner from documents where id = p_document_id for update;

  if v_owner is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from document_versions
    where document_id = p_document_id;

  insert into document_versions (
    document_id, version_number, content, source, instruction, restored_from_version, user_id
  ) values (
    p_document_id, v_next_version, p_content, p_source, p_instruction, p_restored_from_version, v_owner
  )
  returning * into v_row;

  update documents set content = p_content, updated_at = now() where id = p_document_id;

  return v_row;
end;
$$;

revoke execute on function create_document_version(uuid, text, text, text, integer) from public, anon;
grant execute on function create_document_version(uuid, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP: table grants. RLS is the real boundary, but grants are reviewed
-- explicitly per the security checklist rather than assumed — no table
-- gets more than the operations the product actually performs, and `anon`
-- gets nothing on any user-owned table.
-- ---------------------------------------------------------------------------
revoke all on projects, notes, documents, document_versions, project_chat_messages, writing_presets
  from anon, public;

grant select, insert, update, delete on projects to authenticated;
grant select, insert, update, delete on notes to authenticated;
grant select, insert, update, delete on documents to authenticated;
-- document_versions is append-only from the application's perspective —
-- rows are created (via the RPC above, and directly by the app) and read,
-- never updated or deleted.
grant select, insert on document_versions to authenticated;
-- Chat messages are created, read, and bulk-deleted ("Clear chat") — never
-- individually updated.
grant select, insert, delete on project_chat_messages to authenticated;
grant select, insert, update, delete on writing_presets to authenticated;

-- ---------------------------------------------------------------------------
-- STEP D: claiming legacy data for your own account.
-- Legacy rows (user_id is null) are invisible under RLS above until
-- explicitly assigned. See scripts/claim-legacy-data.ts and the README's
-- "Auth setup" section for how to run it — it uses the admin/secret client,
-- which bypasses RLS by design, and must never be exposed as an API route.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP E (NOT executed here — run manually, later, once legacy data has
-- been claimed and every row has a non-null user_id): tighten ownership
-- columns to NOT NULL. Left commented out on purpose — running this before
-- claiming legacy data would fail loudly (good) but there is no reason to
-- even attempt it as part of this migration.
--
-- alter table projects alter column user_id set not null;
-- alter table notes alter column user_id set not null;
-- alter table documents alter column user_id set not null;
-- alter table document_versions alter column user_id set not null;
-- alter table project_chat_messages alter column user_id set not null;
-- alter table writing_presets alter column user_id set not null;
