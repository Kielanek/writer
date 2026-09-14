-- Manual RLS/security verification for provider-cost budget functions, as
-- updated by supabase/migrations/0014_starter_pro_plans.sql (both functions
-- now take an explicit p_period_start instead of deriving it from trial
-- columns internally — see lib/entitlements/period.ts). Same begin/rollback
-- pattern as the other two verification files in this directory.

begin;

-- USER_A = 11111111-1111-1111-1111-111111111111
-- USER_B = 22222222-2222-2222-2222-222222222222

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

update profiles set plan_id = 'starter' where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 1) No one (not even the owning user) can read provider_cost_reservations
-- directly — this table is purely an internal cost-control mechanism.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  perform 1 from provider_cost_reservations limit 1;
  raise exception 'SECURITY BUG: authenticated could read provider_cost_reservations';
exception
  when insufficient_privilege then
    raise notice 'OK: provider_cost_reservations has no SELECT grant for authenticated';
end $$;

reset role;

set local role anon;
do $$
begin
  perform 1 from provider_cost_reservations limit 1;
  raise exception 'SECURITY BUG: anon could read provider_cost_reservations';
exception
  when insufficient_privilege then
    raise notice 'OK: anon has no access to provider_cost_reservations';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2) reserve_provider_budget() blocks once the (Starter) budget is
-- exhausted, and never lets the caller reserve on someone else's behalf
-- (there is no user_id parameter at all — auth.uid() is the only source).
-- p_period_start is caller-supplied (the app resolves it via
-- getEntitlementPeriod()) — '-infinity' here matches Starter's lifetime cap.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

select (reserve_provider_budget('test', 0.10, 0.50, '-infinity'::timestamptz)).reserved_cost_usd = 0.10 as first_reservation_ok;
-- Expect: true.

do $$
begin
  perform reserve_provider_budget('test', 0.50, 0.50, '-infinity'::timestamptz); -- 0.10 + 0.50 > 0.50
  raise exception 'SECURITY BUG: reservation exceeding budget was allowed';
exception
  when others then
    if sqlerrm = 'provider_budget_exhausted' then
      raise notice 'OK: over-budget reservation correctly rejected';
    else
      raise;
    end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3) A different user cannot reconcile or release User A's reservation.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';
-- Capture User A's reservation id for the next block.
create temporary table tmp_reservation as
  select id from provider_cost_reservations where user_id = '11111111-1111-1111-1111-111111111111' and status = 'reserved' limit 1;
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222"}';

do $$
declare
  v_target_id uuid;
begin
  select id into v_target_id from tmp_reservation;

  perform reconcile_provider_reservation(v_target_id, 0.05);
  raise exception 'SECURITY BUG: User B reconciled User A''s reservation';
exception
  when others then
    if sqlerrm = 'reservation_not_found' then
      raise notice 'OK: cross-user reconcile correctly rejected (scoped by auth.uid() internally)';
    else
      raise;
    end if;
end $$;

reset role;

-- The reservation must still be untouched (status = 'reserved').
set local role postgres;
select status from provider_cost_reservations where id = (select id from tmp_reservation);
-- Expect: 'reserved'.
reset role;

-- ---------------------------------------------------------------------------
-- 4) get_provider_cost_total() only ever sums the CALLING user's own cost,
-- for whatever period_start it's given.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';
select reconcile_provider_reservation((select id from tmp_reservation), 0.04);
select get_provider_cost_total('-infinity'::timestamptz) as user_a_total; -- expect: 0.04
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222"}';
select get_provider_cost_total('-infinity'::timestamptz) as user_b_total; -- expect: 0, never sees User A's 0.04
reset role;

-- ---------------------------------------------------------------------------
-- 5) plan_id still cannot be changed by anyone via the client (re-verifies
-- the 0007 grants weren't loosened by this migration).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111"}';

do $$
begin
  update profiles set plan_id = 'pro' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'SECURITY BUG: a user updated their own plan_id';
exception
  when insufficient_privilege then
    raise notice 'OK: profiles UPDATE still correctly rejected';
end $$;

reset role;

rollback; -- discard every seeded/test row; nothing above persists.
