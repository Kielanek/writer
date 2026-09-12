-- SEO Article: adds seo_article as a document type, removes youtube_script as
-- a creatable type (existing youtube_script rows are left untouched — the
-- CHECK constraints below still allow it, so old data never breaks), and
-- adds documents.seo_settings for frozen primary/secondary keyword config.
-- Run this in the Supabase SQL editor after 0003_preset_settings.sql.

-- ---------------------------------------------------------------------------
-- documents.type: widen the CHECK constraint to also allow 'seo_article'.
-- youtube_script stays in the allowed list on purpose — old rows of that
-- type must keep working; only the application layer stops new ones from
-- being created. Constraint is located dynamically (by the column it
-- covers, not by an assumed name) so this is safe even if Supabase
-- generated a non-default constraint name.
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
  check (type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'seo_article', 'summary'));

-- ---------------------------------------------------------------------------
-- writing_presets.document_type: same widening, same reasoning — old
-- youtube_script presets must remain valid rows, just not creatable anew.
-- ---------------------------------------------------------------------------
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
  check (document_type in ('youtube_script', 'linkedin_post', 'newsletter', 'article', 'seo_article', 'summary'));

-- ---------------------------------------------------------------------------
-- documents.seo_settings: frozen { primaryKeyword, secondaryKeywords }
-- config for seo_article Documents (see lib/writing-engine/seoKeywords.ts).
-- Null for every other document type, and for existing rows created before
-- this feature existed.
-- ---------------------------------------------------------------------------
alter table documents
  add column if not exists seo_settings jsonb;
