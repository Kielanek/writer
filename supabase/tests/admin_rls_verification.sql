-- Manual RLS/security verification for
-- supabase/migrations/0010_admin_trial_config.sql. Same begin/rollback
-- pattern as the other verification files in this directory.
--
-- Admin AUTHORIZATION is NOT a database concept in this app (see
-- lib/admin/auth.ts — it's the server-only ADMIN_USER_IDS env var), so
-- there is nothing to test here about "can an admin role do X" — what
-- matters is that NO Postgres role reachable from the browser (anon,
-- authenticated) can read or write plan_configs / admin_audit_log, since
-- every admin route relies on the admin/secret client + requireAdmin(),
-- never a Postgres-level admin role.

begin;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) plan_configs: authenticated CAN read (numbers aren't sensitive — the
-- trial UI already shows them), but CANNOT write at all.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  perform 1 from plan_configs where plan_id = 'trial' limit 1;
  raise exception 'SECURITY BUG: authenticated could not read plan_configs (expected to succeed)';
exception
  when insufficient_privilege then
    raise exception 'SECURITY BUG: plan_configs SELECT unexpectedly denied to authenticated';
  when others then
    -- Any other outcome (including simply returning 0/1 rows) is fine —
    -- we only re-raise if it was specifically a permission error above.
    null;
end $$;

do $$
begin
  update plan_configs set max_projects = 999 where plan_id = 'trial';
  raise exception 'SECURITY BUG: a normal user updated plan_configs';
exception
  when insufficient_privilege then
    raise notice 'OK: plan_configs UPDATE correctly rejected for authenticated';
end $$;

do $$
begin
  insert into plan_configs (plan_id, max_projects, ai_actions_limit, transcription_minutes_limit, trial_days)
  values ('pro', 999, 999, 999, 999);
  raise exception 'SECURITY BUG: a normal user inserted a plan_configs row';
exception
  when insufficient_privilege then
    raise notice 'OK: plan_configs INSERT correctly rejected for authenticated';
end $$;

reset role;

set local role anon;
do $$
begin
  perform 1 from plan_configs limit 1;
  raise exception 'SECURITY BUG: anon could read plan_configs';
exception
  when insufficient_privilege then
    raise notice 'OK: anon has no access to plan_configs';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2) admin_audit_log: zero access for authenticated or anon, in either
-- direction.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  perform 1 from admin_audit_log limit 1;
  raise exception 'SECURITY BUG: authenticated could read admin_audit_log';
exception
  when insufficient_privilege then
    raise notice 'OK: admin_audit_log has no SELECT grant for authenticated';
end $$;

do $$
begin
  insert into admin_audit_log (admin_user_id, action) values ('11111111-1111-1111-1111-111111111111', 'fake_action');
  raise exception 'SECURITY BUG: authenticated inserted an admin_audit_log row';
exception
  when insufficient_privilege then
    raise notice 'OK: admin_audit_log INSERT correctly rejected for authenticated';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3) profiles.plan_id / trial_started_at / trial_ends_at still cannot be
-- changed by the client (re-verifies 0007's grants weren't loosened by
-- adding these columns).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  update profiles set trial_ends_at = now() + interval '100 years' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'SECURITY BUG: a user extended their own trial_ends_at';
exception
  when insufficient_privilege then
    raise notice 'OK: profiles UPDATE (including new trial columns) still correctly rejected';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4) New signup defaults to trial with correct dates (handle_new_user()).
-- ---------------------------------------------------------------------------
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222');

set local role postgres;
select plan_id, trial_started_at is not null as has_start, trial_ends_at is not null as has_end
  from profiles where id = '22222222-2222-2222-2222-222222222222';
-- Expect: plan_id = 'trial', has_start = true, has_end = true.
reset role;

rollback; -- discard every seeded/test row; nothing above persists.
