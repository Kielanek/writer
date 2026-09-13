-- Real provider-cost budget for trial accounts: a hard internal safety cap
-- on actual OpenAI spend, independent of (and enforced alongside) the
-- product-facing limits from 0007_usage_limits.sql.
--
-- Run this in the Supabase SQL editor after
-- 0008_fix_project_limit_function_security.sql.

-- ---------------------------------------------------------------------------
-- STEP A: allow the new "trial" plan and "provider_cost" event type.
-- ---------------------------------------------------------------------------
alter table profiles drop constraint if exists profiles_plan_id_check;
alter table profiles add constraint profiles_plan_id_check
  check (plan_id in ('development', 'trial', 'pro'));

alter table usage_events drop constraint if exists usage_events_event_type_check;
alter table usage_events add constraint usage_events_event_type_check
  check (event_type in ('ai_action', 'transcription_seconds', 'provider_cost'));

-- ---------------------------------------------------------------------------
-- STEP B: provider_cost_reservations — the pre-call reservation ledger.
-- Deliberately a SEPARATE table from usage_events: reservation rows are
-- mutated in place (reserved -> completed/released), which is fundamentally
-- different from usage_events' append-only history, and the two shouldn't
-- share a schema just because they're both "usage-shaped".
--
-- No RLS policies at all (not even SELECT) — unlike usage_events, which a
-- user can read for general product-usage transparency, reservation rows
-- exist purely to protect internal provider economics that must never be
-- readable by the client, even via a raw REST call with a valid JWT. Only
-- the SECURITY DEFINER functions below ever touch this table.
-- ---------------------------------------------------------------------------
create table if not exists provider_cost_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  reserved_cost_usd numeric(12, 8) not null check (reserved_cost_usd >= 0),
  actual_cost_usd numeric(12, 8),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists provider_cost_reservations_user_status_idx
  on provider_cost_reservations (user_id, status);

alter table provider_cost_reservations enable row level security;
revoke all on provider_cost_reservations from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- STEP C: reserve_provider_budget — atomic pre-call check-and-reserve.
--
-- SECURITY DEFINER is required (not just "convenient"): `authenticated` has
-- no grant at all on provider_cost_reservations, by design (see above), so
-- a SECURITY INVOKER function couldn't write here regardless of RLS. This
-- mirrors create_project_with_limit()'s reasoning in 0008 — the function
-- IS the security boundary, and it derives the caller exclusively from
-- auth.uid(), never a parameter, so running with elevated privileges here
-- doesn't create a spoofing surface.
--
-- Concurrency: a transaction-scoped advisory lock (keyed per user) forces
-- concurrent reservation attempts from the SAME user to serialize, so two
-- browser tabs racing for the last $0.05 of budget can't both read
-- "committed cost is under budget" before either has recorded its own
-- reservation — the second one to acquire the lock sees the first's
-- reservation already counted.
--
-- Period: committed cost is summed with NO calendar-month filter — see
-- get_provider_cost_total() below for why (the trial budget must not
-- reset just because the month rolled over). `profiles.created_at` stands
-- in for the not-yet-implemented `trial_started_at`; swapping to a real
-- trial-period column later only changes this one WHERE clause.
-- ---------------------------------------------------------------------------
create or replace function reserve_provider_budget(
  p_feature text,
  p_reserved_cost_usd numeric,
  p_budget_limit_usd numeric
) returns provider_cost_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start timestamptz;
  v_committed numeric;
  v_row provider_cost_reservations;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('provider_budget:' || v_user_id::text));

  select created_at into v_period_start from profiles where id = v_user_id;
  if v_period_start is null then
    v_period_start := '-infinity'::timestamptz;
  end if;

  select
    coalesce((
      select sum(quantity) from usage_events
      where user_id = v_user_id and event_type = 'provider_cost' and created_at >= v_period_start
    ), 0)
    +
    coalesce((
      select sum(reserved_cost_usd) from provider_cost_reservations
      where user_id = v_user_id and status = 'reserved'
    ), 0)
  into v_committed;

  if v_committed + p_reserved_cost_usd > p_budget_limit_usd then
    raise exception 'trial_budget_exhausted';
  end if;

  insert into provider_cost_reservations (user_id, feature, reserved_cost_usd, status)
  values (v_user_id, p_feature, p_reserved_cost_usd, 'reserved')
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function reserve_provider_budget(text, numeric, numeric) from public, anon;
grant execute on function reserve_provider_budget(text, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP D: reconcile_provider_reservation — call after a successful OpenAI
-- request, with its REAL provider-reported cost. Closes the reservation
-- (reserved -> completed) and, in the same statement, writes the permanent
-- provider_cost usage_events row — the reservation was only ever a
-- temporary hold on budget, not the historical record.
-- ---------------------------------------------------------------------------
create or replace function reconcile_provider_reservation(
  p_reservation_id uuid,
  p_actual_cost_usd numeric,
  p_metadata jsonb default '{}'::jsonb
) returns provider_cost_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row provider_cost_reservations;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update provider_cost_reservations
    set status = 'completed', actual_cost_usd = p_actual_cost_usd, completed_at = now()
    where id = p_reservation_id and user_id = v_user_id and status = 'reserved'
    returning * into v_row;

  if v_row.id is null then
    raise exception 'reservation_not_found';
  end if;

  insert into usage_events (user_id, event_type, quantity, metadata)
  values (v_user_id, 'provider_cost', p_actual_cost_usd, p_metadata || jsonb_build_object('feature', v_row.feature));

  return v_row;
end;
$$;

revoke execute on function reconcile_provider_reservation(uuid, numeric, jsonb) from public, anon;
grant execute on function reconcile_provider_reservation(uuid, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP E: release_provider_reservation — call when the guarded operation
-- failed (no OpenAI cost was actually incurred, so nothing is recorded to
-- usage_events; the hold on budget is simply released). Best-effort by
-- design in the app layer (lib/entitlements/reservation.ts logs but doesn't
-- throw on failure here) so a release problem never masks the original
-- error that caused the release in the first place.
-- ---------------------------------------------------------------------------
create or replace function release_provider_reservation(
  p_reservation_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update provider_cost_reservations
    set status = 'released', completed_at = now()
    where id = p_reservation_id and user_id = auth.uid() and status = 'reserved';
end;
$$;

revoke execute on function release_provider_reservation(uuid) from public, anon;
grant execute on function release_provider_reservation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP F: get_provider_cost_total — the authoritative "how much real
-- provider cost has this user incurred" query, used both to build
-- getUserEntitlements()'s internal (never UI-exposed) providerCost field
-- and for any future admin/analytics use. SECURITY INVOKER is sufficient
-- here (read-only, and `authenticated` already has SELECT on both
-- usage_events and profiles).
-- ---------------------------------------------------------------------------
create or replace function get_provider_cost_total()
returns numeric
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(sum(quantity), 0)
  from usage_events
  where user_id = auth.uid()
    and event_type = 'provider_cost'
    and created_at >= coalesce(
      (select created_at from profiles where id = auth.uid()),
      '-infinity'::timestamptz
    );
$$;

revoke execute on function get_provider_cost_total() from public, anon;
grant execute on function get_provider_cost_total() to authenticated;
