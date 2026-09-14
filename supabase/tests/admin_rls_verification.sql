-- Manual RLS/security verification for
-- supabase/migrations/0014_starter_pro_plans.sql (superseding the original
-- 0010_admin_trial_config.sql checks). Same begin/rollback pattern as the
-- other verification files in this directory.
--
-- Admin AUTHORIZATION is NOT a database concept in this app (see
-- lib/admin/auth.ts — it's the server-only ADMIN_USER_IDS env var), so
-- there is nothing to test here about "can an admin role do X" — what
-- matters is that NO Postgres role reachable from the browser (anon,
-- authenticated) can read or write plan_configs / admin_audit_log /
-- plan_change_audit, since every admin route (and the demo-upgrade route)
-- relies on the admin/secret client + application-level checks, never a
-- Postgres-level admin role.

begin;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) plan_configs: authenticated CAN read (numbers aren't sensitive — the
-- Account/Upgrade pages already show them), but CANNOT write at all.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  perform 1 from plan_configs where plan_id = 'starter' limit 1;
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
  update plan_configs set max_projects = 999 where plan_id = 'starter';
  raise exception 'SECURITY BUG: a normal user updated plan_configs';
exception
  when insufficient_privilege then
    raise notice 'OK: plan_configs UPDATE correctly rejected for authenticated';
end $$;

do $$
begin
  insert into plan_configs (plan_id, max_projects, ai_actions_limit, transcription_minutes_limit)
  values ('fake-plan', 999, 999, 999);
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
-- 2) admin_audit_log / plan_change_audit: zero access for authenticated or
-- anon, in either direction.
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

do $$
begin
  perform 1 from plan_change_audit limit 1;
  raise exception 'SECURITY BUG: authenticated could read plan_change_audit';
exception
  when insufficient_privilege then
    raise notice 'OK: plan_change_audit has no SELECT grant for authenticated';
end $$;

do $$
begin
  insert into plan_change_audit (user_id, from_plan, to_plan, source)
  values ('11111111-1111-1111-1111-111111111111', 'starter', 'pro', 'demo_checkout');
  raise exception 'SECURITY BUG: authenticated inserted a plan_change_audit row directly';
exception
  when insufficient_privilege then
    raise notice 'OK: plan_change_audit INSERT correctly rejected for authenticated (only the admin client, via applyPlanChange(), may write here)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3) profiles.plan_id / plan_changed_at still cannot be changed by the
-- client (re-verifies 0007's grants weren't loosened by adding this column).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  update profiles set plan_id = 'pro', plan_changed_at = now() where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'SECURITY BUG: a user changed their own plan_id/plan_changed_at';
exception
  when insufficient_privilege then
    raise notice 'OK: profiles UPDATE (including plan_changed_at) still correctly rejected';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4) New signup defaults to starter, with no time expiration (plan_changed_at
-- is set, but there is nothing resembling a trial end date anymore).
-- ---------------------------------------------------------------------------
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222');

set local role postgres;
select plan_id, plan_changed_at is not null as has_plan_changed_at
  from profiles where id = '22222222-2222-2222-2222-222222222222';
-- Expect: plan_id = 'starter', has_plan_changed_at = true.
reset role;

rollback; -- discard every seeded/test row; nothing above persists.
