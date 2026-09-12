-- Consolidates SEO Article back into Article: every Article is SEO-focused
-- now, so "seo_article" is removed as a separate document type. Any
-- existing seo_article rows are migrated to type = 'article' with all
-- content, versions, preset_snapshot, and seo_settings preserved — nothing
-- is deleted. Run this in the Supabase SQL editor after 0004_seo_article.sql.

-- ---------------------------------------------------------------------------
-- 1) Normalize preset_snapshot's embedded documentType fields on affected
-- rows first, so the Writing Engine never has to special-case an old
-- snapshot that still says "seo_article" internally after its Document's
-- own `type` becomes 'article'.
-- ---------------------------------------------------------------------------
update documents
set preset_snapshot = jsonb_set(preset_snapshot, '{documentType}', '"article"'::jsonb, true)
where type = 'seo_article'
  and jsonb_typeof(preset_snapshot) = 'object';

update documents
set preset_snapshot = jsonb_set(
  preset_snapshot,
  '{settings,typeSpecific,documentType}',
  '"article"'::jsonb,
  false
)
where type = 'seo_article'
  and jsonb_typeof(preset_snapshot -> 'settings') = 'object'
  and jsonb_typeof(preset_snapshot -> 'settings' -> 'typeSpecific') = 'object';

-- ---------------------------------------------------------------------------
-- 2) Re-point preset_id from the removed built-in 'seo-article-*' ids to
-- their 'article-*' equivalents. preset_id is reference-only (preset_snapshot
-- is the real source of truth for generation/editing), but keeping it
-- consistent avoids a dangling id if anything ever looks it up again.
-- ---------------------------------------------------------------------------
update documents
set preset_id = regexp_replace(preset_id, '^seo-article-', 'article-')
where type = 'seo_article' and preset_id like 'seo-article-%';

-- ---------------------------------------------------------------------------
-- 3) Migrate the Documents themselves. content, seo_settings, versions,
-- project association, and timestamps are untouched by this update.
-- ---------------------------------------------------------------------------
update documents set type = 'article' where type = 'seo_article';

-- ---------------------------------------------------------------------------
-- 4) Same normalization for any custom writing_presets rows that were
-- created under document_type = 'seo_article' (none are expected, since the
-- Preset Wizard never asked for keywords there, but this stays safe if any
-- exist).
-- ---------------------------------------------------------------------------
update writing_presets
set settings = jsonb_set(settings, '{typeSpecific,documentType}', '"article"'::jsonb, false)
where document_type = 'seo_article'
  and jsonb_typeof(settings) = 'object'
  and jsonb_typeof(settings -> 'typeSpecific') = 'object';

update writing_presets set document_type = 'article' where document_type = 'seo_article';

-- ---------------------------------------------------------------------------
-- 5) Narrow both CHECK constraints back down now that no row uses
-- 'seo_article' any more. Located dynamically by column, not by an assumed
-- constraint name (same approach as 0004_seo_article.sql).
-- ---------------------------------------------------------------------------
do $$
declare
  con record;
  col_attnum smallint;
begin
  select attnum into col_attnum
  from pg_attribute
  where attrelid = 'documents'::regclass and attname = 'type';

  for con in
    select conname
    from pg_constraint
    where conrelid = 'documents'::regclass
      and contype = 'c'
      and col_attnum = any(conkey)
  loop
    execute format('alter table documents drop constraint %I', con.conname);
  end loop;
end $$;

alter table documents
  add constraint documents_type_check
  check (type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'summary'));

do $$
declare
  con record;
  col_attnum smallint;
begin
  select attnum into col_attnum
  from pg_attribute
  where attrelid = 'writing_presets'::regclass and attname = 'document_type';

  for con in
    select conname
    from pg_constraint
    where conrelid = 'writing_presets'::regclass
      and contype = 'c'
      and col_attnum = any(conkey)
  loop
    execute format('alter table writing_presets drop constraint %I', con.conname);
  end loop;
end $$;

alter table writing_presets
  add constraint writing_presets_document_type_check
  check (document_type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'summary'));
