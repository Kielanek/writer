-- Manual RLS verification queries for supabase/migrations/0006_auth_and_rls.sql.
--
-- Run this in the Supabase SQL Editor. The SQL Editor connects as a
-- superuser (postgres), which BYPASSES Row Level Security entirely — so
-- every block below explicitly switches to the `authenticated` (or `anon`)
-- role and stamps a fake JWT `sub` claim via `request.jwt.claims`, which is
-- exactly what `auth.uid()` reads at request time. This is the standard way
-- to exercise RLS policies from the SQL Editor without a real session.
--
-- Plain SQL only (no psql meta-commands like \set) so this also runs
-- unmodified in the Supabase Dashboard's SQL Editor, not just psql.
--
-- Uses `projects` as the representative table; the same shape of query
-- applies to notes, documents, document_versions, project_chat_messages,
-- and writing_presets, since they all use the identical
-- `user_id = auth.uid()` policy pattern.
--
-- Wrapped in begin/rollback, so it never leaves any test data behind —
-- safe to run against a real project, though a disposable/staging project
-- is still recommended.

begin;

-- Two disposable test users. Real user ids come from auth.users; these are
-- placeholder UUIDs that don't need real Auth accounts for RLS purposes —
-- RLS only checks the claim, not that a matching row exists in auth.users.
-- USER_A = 11111111-1111-1111-1111-111111111111
-- USER_B = 22222222-2222-2222-2222-222222222222

-- Seed one project owned by each user, inserted as postgres (bypasses RLS,
-- which is fine — we're only testing SELECT/INSERT/UPDATE from here on).
insert into projects (id, user_id, name)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A''s project'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B''s project');

-- ---------------------------------------------------------------------------
-- 1) An authenticated user can access their own row, and ONLY their own.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select id, name from projects order by name;
-- Expect: exactly one row, "A's project". "B's project" must NOT appear.

reset role;

-- ---------------------------------------------------------------------------
-- 2) The anon role (no session at all) sees nothing.
-- ---------------------------------------------------------------------------
set local role anon;

select count(*) as anon_visible_rows from projects;
-- Expect: 0, or a permission-denied error — either means anon has no
-- access, which is the point of this check (see the migration's "STEP:
-- table grants", which revokes all privileges from anon on this table).

reset role;

-- ---------------------------------------------------------------------------
-- 3) Insert cannot spoof another user's user_id.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  insert into projects (id, user_id, name)
  values ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Spoofed');
  raise exception 'SECURITY BUG: insert with a spoofed user_id succeeded';
exception
  when insufficient_privilege then
    raise notice 'OK: insert correctly rejected (row-level security policy violation)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4) Update cannot reassign a row's ownership to another user.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  update projects
    set user_id = '22222222-2222-2222-2222-222222222222'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'SECURITY BUG: update reassigned ownership to another user';
exception
  when insufficient_privilege then
    raise notice 'OK: ownership reassignment correctly rejected';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5) User B cannot read, update, or delete User A's row by guessing its UUID.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222"}';

select count(*) as should_be_zero
  from projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Expect: 0.

update projects set name = 'Hijacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Expect: "UPDATE 0" — zero rows affected, not an error (RLS silently
-- filters rows outside USING()), which is intentional (avoids existence
-- disclosure at the SQL level; the application layer still returns a 404).

delete from projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Expect: "DELETE 0".

reset role;

set local role postgres;
select name from projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Expect: "A's project" — unchanged and undeleted, proving the no-op above
-- really was a no-op and not a silently-succeeded write.

rollback; -- discard every seeded/test row; nothing above persists.
