-- Manual RLS verification for supabase/migrations/0007_usage_limits.sql.
-- Same approach as supabase/tests/rls_verification.sql — run in the
-- Supabase SQL Editor, wrapped in begin/rollback so nothing persists.

begin;

-- USER_A = 11111111-1111-1111-1111-111111111111
-- USER_B = 22222222-2222-2222-2222-222222222222

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- The on_auth_user_created trigger should have fired for both. Confirm,
-- then force known plan values for the checks below.
select id, plan_id from profiles where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
-- Expect: two rows, both plan_id = 'development' (the trigger's default).

update profiles set plan_id = 'pro' where id = '11111111-1111-1111-1111-111111111111';

insert into usage_events (id, user_id, event_type, quantity, metadata)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ai_action', 1, '{"feature":"test"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'ai_action', 1, '{"feature":"test"}');

-- ---------------------------------------------------------------------------
-- 1) A user can read their own profile and usage; not the other user's.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select id, plan_id from profiles;
-- Expect: exactly one row, User A's, plan_id = 'pro'.

select user_id, event_type, quantity from usage_events;
-- Expect: exactly one row, User A's.

reset role;

-- ---------------------------------------------------------------------------
-- 2) A user cannot change their own plan_id — no UPDATE grant at all.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  update profiles set plan_id = 'pro' where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'SECURITY BUG: a user updated another user''s plan_id';
exception
  when insufficient_privilege then
    raise notice 'OK: profiles UPDATE correctly rejected (no grant)';
end $$;

do $$
begin
  update profiles set plan_id = 'pro' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'SECURITY BUG: a user updated their OWN plan_id';
exception
  when insufficient_privilege then
    raise notice 'OK: self plan_id update also correctly rejected (no grant, at all, for anyone)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3) A user cannot insert a fake usage event, for themselves or anyone else
-- — no INSERT grant on usage_events at all (only the admin/secret client,
-- via lib/entitlements/usage.ts's recordUsageEvent, can write here).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  insert into usage_events (user_id, event_type, quantity)
  values ('11111111-1111-1111-1111-111111111111', 'ai_action', 999);
  raise exception 'SECURITY BUG: a user inserted a usage_events row directly';
exception
  when insufficient_privilege then
    raise notice 'OK: usage_events INSERT correctly rejected (no grant)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4) anon has no access to either table.
-- ---------------------------------------------------------------------------
set local role anon;

do $$
begin
  perform 1 from profiles limit 1;
  raise exception 'SECURITY BUG: anon could read profiles';
exception
  when insufficient_privilege then
    raise notice 'OK: anon has no access to profiles';
end $$;

do $$
begin
  perform 1 from usage_events limit 1;
  raise exception 'SECURITY BUG: anon could read usage_events';
exception
  when insufficient_privilege then
    raise notice 'OK: anon has no access to usage_events';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5) get_usage_total() only ever sums the CALLING user's own events, even
-- if asked about another user's data (it has no such parameter — this
-- confirms it can't be tricked via event_type/period alone).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222"}';

select get_usage_total('ai_action', '2000-01-01T00:00:00Z'::timestamptz) as user_b_total;
-- Expect: 1 (User B's own single event) — never User A's.

reset role;

-- ---------------------------------------------------------------------------
-- 6) create_project_with_limit() blocks once at the limit, and never lets a
-- user create a project they don't own.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select (create_project_with_limit('Within limit', null, 5)).user_id = '11111111-1111-1111-1111-111111111111' as owned_by_caller;
-- Expect: true.

do $$
begin
  perform create_project_with_limit('One too many', null, 0);
  raise exception 'SECURITY BUG: project limit of 0 did not block creation';
exception
  when others then
    if sqlerrm = 'project_limit_reached' then
      raise notice 'OK: project_limit_reached raised as expected';
    else
      raise;
    end if;
end $$;

reset role;

rollback; -- discard every seeded/test row; nothing above persists.
