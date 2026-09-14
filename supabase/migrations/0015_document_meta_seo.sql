-- Meta title / meta description for SEO Articles — shown below the content
-- editor with a Google-style desktop/mobile search-result preview (see
-- components/documents/seo-meta-panel.tsx). Nullable, same pattern as
-- 0004_seo_article.sql's seo_settings: absent for every non-Article
-- Document, and for Articles created before this existed.
--
-- Run this in the Supabase SQL editor after 0014_starter_pro_plans.sql.

alter table documents
  add column if not exists meta_title text,
  add column if not exists meta_description text;
