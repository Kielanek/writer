-- Replaces the time-boxed Trial model with a permanent Starter plan plus a
-- demo-only Pro upgrade. Starter is free, has NO expiration, and is gated
-- purely by lifetime usage limits; Pro has larger calendar-month limits and
-- is activated only through the app's own demo-checkout endpoint (no Stripe,
-- no real payment processing — see lib/entitlements/planChange.ts).
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) after
-- 0013_allow_zero_cost_usage_events.sql.

-- ---------------------------------------------------------------------------
-- STEP A: plan_configs gains the columns needed to describe BOTH Starter and
-- Pro (previously only `trial` had a DB row here; development/pro were
-- code-only). trial_days is left in place, unused — see STEP D below and
-- lib/entitlements/plans.ts, which no longer reads it.
-- ---------------------------------------------------------------------------
alter table plan_configs
  add column if not exists display_name text,
  add column if not exists usage_period text check (usage_period in ('lifetime', 'monthly', 'unlimited')),
  add column if not exists monthly_price_pln numeric(10, 2);

-- Rename the existing `trial` row to `starter` in place (plan_configs.plan_id
-- has no foreign-key references, so this is a safe, isolated rename) and
-- adopt the product's final Starter defaults (see the spec: 3 Projects / 10
-- AI Actions / 20 transcription minutes / $0.50 cost cap, all lifetime, not
-- monthly).
update plan_configs
  set plan_id = 'starter',
      display_name = 'Starter',
      max_projects = 3,
      ai_actions_limit = 10,
      transcription_minutes_limit = 20,
      api_cost_budget_usd = 0.50,
      usage_period = 'lifetime',
      monthly_price_pln = 0
  where plan_id = 'trial';

-- Defensive: if the `trial` row never existed (fresh install), seed Starter
-- directly instead of relying on the rename above.
insert into plan_configs (plan_id, display_name, max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, usage_period, monthly_price_pln)
values ('starter', 'Starter', 3, 10, 20, 0.50, 'lifetime', 0)
on conflict (plan_id) do nothing;

-- Pro is a new DB row — admin-editable from the same Plan Settings UI as
-- Starter (see components/admin/plan-settings-form.tsx). Demo commercial
-- values only, per the product spec; not final pricing.
insert into plan_configs (plan_id, display_name, max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, usage_period, monthly_price_pln)
values ('pro', 'Pro', 25, 300, 180, null, 'monthly', 49)
on conflict (plan_id) do nothing;

-- ---------------------------------------------------------------------------
-- STEP B: profiles — allow the new plan_id values, add plan_changed_at (the
-- one column the Pro monthly-usage-period calculation needs; see
-- lib/entitlements/period.ts). trial_started_at/trial_ends_at are left in
-- place, unused by any active code path from this migration forward — see
-- the product spec's "leave legacy columns for backward compatibility"
-- guidance.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists plan_changed_at timestamptz;

-- Drop the OLD check constraint (development/trial/pro) BEFORE migrating any
-- rows — the existing constraint does not yet allow 'starter', so updating
-- plan_id to 'starter' while it's still in force would itself violate it.
-- With no constraint in force momentarily, the UPDATE below can freely move
-- rows from 'trial' to 'starter', preserving all usage history (usage_events
-- is untouched) and every other column, including the now-unused
-- trial_started_at/trial_ends_at. The tightened constraint (development/
-- starter/pro) is added back immediately after, once every row already
-- satisfies it.
alter table profiles drop constraint if exists profiles_plan_id_check;

update profiles set plan_id = 'starter' where plan_id = 'trial';

alter table profiles add constraint profiles_plan_id_check
  check (plan_id in ('development', 'starter', 'pro'));

-- ---------------------------------------------------------------------------
-- STEP C: plan_change_audit — records every demo (and future real) plan
-- change. Same posture as admin_audit_log: zero grant for anon/authenticated
-- — only server code holding the admin/secret client writes here, and only
-- after deriving the acting user from their own validated session (see
-- lib/entitlements/planChange.ts's applyPlanChange(), the single function
-- that writes both profiles.plan_id and this table).
-- ---------------------------------------------------------------------------
create table if not exists plan_change_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  from_plan text not null,
  to_plan text not null,
  source text not null default 'demo_checkout',
  created_at timestamptz not null default now()
);

create index if not exists plan_change_audit_user_id_idx on plan_change_audit (user_id, created_at desc);

alter table plan_change_audit enable row level security;
revoke all on plan_change_audit from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- STEP D: new signups now default to `starter`, with no trial period at all
-- (no trial_started_at/trial_ends_at are set). Existing accounts (including
-- the developer/admin one) are untouched — this only changes what happens on
-- a NEW auth.users insert.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan_id, plan_changed_at)
  values (new.id, 'starter', now())
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP E: provider-cost period resolution now takes an explicit
-- p_period_start, computed centrally in the app by
-- lib/entitlements/period.ts's getEntitlementPeriod() (epoch for Starter's
-- lifetime cap — Starter never resets — and max(calendar-month-start,
-- plan_changed_at) for Pro, so historical Starter spend never counts against
-- a fresh Pro period) — the same pattern get_usage_total() already used,
-- instead of each function re-deriving "period start" from trial columns
-- internally.
-- ---------------------------------------------------------------------------
drop function if exists get_provider_cost_total();
drop function if exists reserve_provider_budget(text, numeric, numeric);

create or replace function get_provider_cost_total(
  p_period_start timestamptz default '-infinity'::timestamptz
) returns numeric
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(sum(quantity), 0)
  from usage_events
  where user_id = auth.uid()
    and event_type = 'provider_cost'
    and created_at >= p_period_start;
$$;

revoke execute on function get_provider_cost_total(timestamptz) from public, anon;
grant execute on function get_provider_cost_total(timestamptz) to authenticated;

create or replace function reserve_provider_budget(
  p_feature text,
  p_reserved_cost_usd numeric,
  p_budget_limit_usd numeric,
  p_period_start timestamptz default '-infinity'::timestamptz
) returns provider_cost_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_committed numeric;
  v_row provider_cost_reservations;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('provider_budget:' || v_user_id::text));

  select
    coalesce((
      select sum(quantity) from usage_events
      where user_id = v_user_id and event_type = 'provider_cost' and created_at >= p_period_start
    ), 0)
    +
    coalesce((
      select sum(reserved_cost_usd) from provider_cost_reservations
      where user_id = v_user_id and status = 'reserved'
    ), 0)
  into v_committed;

  if v_committed + p_reserved_cost_usd > p_budget_limit_usd then
    raise exception 'provider_budget_exhausted';
  end if;

  insert into provider_cost_reservations (user_id, feature, reserved_cost_usd, status)
  values (v_user_id, p_feature, p_reserved_cost_usd, 'reserved')
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function reserve_provider_budget(text, numeric, numeric, timestamptz) from public, anon;
grant execute on function reserve_provider_budget(text, numeric, numeric, timestamptz) to authenticated;

-- get_usage_total (ai_action / transcription_seconds) already takes an
-- explicit p_period_start from the caller — no SQL change needed there; the
-- app now resolves that start date the same way for every usage type
-- (lib/entitlements/period.ts's getEntitlementPeriod()).
