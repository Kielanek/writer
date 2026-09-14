-- Folds meta_title/meta_description (added in 0015_document_meta_seo.sql as
-- separate columns) into documents.seo_settings instead — SEO metadata for
-- an Article is one JSONB blob (primaryKeyword, secondaryKeywords,
-- metaTitle, metaDescription), not scattered across columns. Also extends
-- document_versions so a manual "Save Version" / AI edit / restore snapshots
-- the Article's full SEO state (keywords + meta title/description) alongside
-- its content, not just content.
--
-- Run this in the Supabase SQL editor after 0015_document_meta_seo.sql.

-- ---------------------------------------------------------------------------
-- STEP A: migrate any existing meta_title/meta_description values into
-- seo_settings, then drop the now-redundant columns. Only articles have
-- seo_settings at all (see 0004_seo_article.sql), so this only touches rows
-- that already have a JSONB object there.
-- ---------------------------------------------------------------------------
update documents
  set seo_settings = seo_settings
    || jsonb_strip_nulls(jsonb_build_object('metaTitle', meta_title, 'metaDescription', meta_description))
  where seo_settings is not null
    and (meta_title is not null or meta_description is not null);

alter table documents
  drop column if exists meta_title,
  drop column if exists meta_description;

-- ---------------------------------------------------------------------------
-- STEP B: document_versions gains seo_settings — a frozen snapshot of the
-- Article's SEO state (keywords + meta title/description) at the moment
-- that version was created, mirroring how preset_snapshot already freezes
-- writing-preset rules per Document (not per version, but same idea: never
-- silently reinterpret history under today's live settings).
-- ---------------------------------------------------------------------------
alter table document_versions
  add column if not exists seo_settings jsonb;

-- ---------------------------------------------------------------------------
-- STEP C: create_document_version gains an optional p_seo_settings param.
-- When provided, it's both stored on the new version row AND applied back
-- to the live document — this is what makes "Restore" bring back the
-- Article's SEO state from that point in time, not just its body content.
-- For ordinary saves (manual/ai_edit/initial), callers pass the CURRENT
-- seo_settings, so this is a no-op merge (documents.seo_settings already
-- equals what's being written back).
-- ---------------------------------------------------------------------------
create or replace function create_document_version(
  p_document_id uuid,
  p_content text,
  p_source text,
  p_instruction text default null,
  p_restored_from_version integer default null,
  p_seo_settings jsonb default null
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
  select user_id into v_owner from documents where id = p_document_id for update;

  if v_owner is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from document_versions
    where document_id = p_document_id;

  insert into document_versions (
    document_id, version_number, content, source, instruction, restored_from_version, user_id, seo_settings
  ) values (
    p_document_id, v_next_version, p_content, p_source, p_instruction, p_restored_from_version, v_owner, p_seo_settings
  )
  returning * into v_row;

  update documents
    set content = p_content,
        seo_settings = coalesce(p_seo_settings, seo_settings),
        updated_at = now()
    where id = p_document_id;

  return v_row;
end;
$$;

revoke execute on function create_document_version(uuid, text, text, text, integer, jsonb) from public, anon;
grant execute on function create_document_version(uuid, text, text, text, integer, jsonb) to authenticated;

-- The old 5-arg overload is superseded — drop it so there's only ever one
-- signature the app can call (Postgres would otherwise keep both, and a
-- stale client call with 5 args would silently keep working against the
-- OLD version forever instead of failing loudly).
drop function if exists create_document_version(uuid, text, text, text, integer);
