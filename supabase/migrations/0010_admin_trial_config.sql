-- Admin Panel foundation: DB-backed Trial plan configuration, trial period
-- dates on profiles, an admin audit log, and switching new-signup default
-- from "development" to "trial". Run after 0009_provider_cost_budget.sql.
--
-- Admin AUTHORIZATION itself is NOT a database concept in this app — it's
-- the server-only ADMIN_USER_IDS env var (see lib/admin/auth.ts). Nothing
-- here grants any Postgres role "admin" privileges; every admin route
-- re-verifies the caller against ADMIN_USER_IDS server-side before ever
-- touching the tables below, and all writes to them go through the
-- admin/secret Supabase client from already-authorized server code —
-- never a client-side Supabase call, which is why none of these tables
-- need or get a write grant for `authenticated`.

-- ---------------------------------------------------------------------------
-- STEP A: profiles gains trial period dates. Nullable — most existing rows
-- (development/pro accounts, and any account created before this
-- migration) legitimately have no trial period at all.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

-- ---------------------------------------------------------------------------
-- STEP B: plan_configs — the single source of truth for Trial limits (see
-- lib/entitlements/planConfig.ts). Development/pro stay code-defined in
-- lib/entitlements/plans.ts on purpose (developer-controlled, not meant to
-- be admin-editable product limits) — only `trial` gets a DB row and an
-- Admin UI. No RLS policies for `authenticated` at all: these numbers are
-- read via the server-side entitlement functions (which already decide
-- what's safe to expose, e.g. never api_cost_budget_usd to the browser),
-- and written ONLY through the admin-authorized /api/admin/trial-config
-- route using the admin/secret client — never a direct client Supabase call.
-- ---------------------------------------------------------------------------
create table if not exists plan_configs (
  plan_id text primary key,
  max_projects integer not null check (max_projects > 0),
  ai_actions_limit integer not null check (ai_actions_limit > 0),
  transcription_minutes_limit numeric not null check (transcription_minutes_limit >= 0),
  api_cost_budget_usd numeric(12, 8) check (api_cost_budget_usd is null or api_cost_budget_usd > 0),
  trial_days integer check (trial_days is null or (trial_days between 1 and 90)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on plan_configs;
create trigger set_updated_at before update on plan_configs
  for each row execute function set_updated_at();

alter table plan_configs enable row level security;
revoke all on plan_configs from anon, authenticated, public;

-- Seed the trial row with the values already live in
-- lib/entitlements/plans.ts as of this migration (3 projects / 10 AI
-- actions / 120 transcription minutes / $0.50 cost cap / 7-day trial) — see
-- that file's comment on why development/pro are NOT seeded here.
insert into plan_configs (plan_id, max_projects, ai_actions_limit, transcription_minutes_limit, api_cost_budget_usd, trial_days)
values ('trial', 3, 10, 120, 0.50, 7)
on conflict (plan_id) do nothing;

-- ---------------------------------------------------------------------------
-- STEP C: admin_audit_log — lightweight trail for admin configuration
-- changes (Trial settings updates, manual plan changes on a user). Written
-- only by already-authorized server code via the admin client, immediately
-- after requireAdmin() succeeds — same "no RLS policy for authenticated at
-- all" posture as plan_configs, for the same reason.
-- ---------------------------------------------------------------------------
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;
revoke all on admin_audit_log from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- STEP D: new signups now default to "trial", with trial_started_at/
-- trial_ends_at computed from the CURRENT plan_configs.trial_days at the
-- moment of signup (falls back to 7 if the config row is ever missing).
-- Existing accounts (including the developer/admin one) are UNTOUCHED —
-- this only changes what happens on a NEW auth.users insert.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_days integer;
begin
  select trial_days into v_trial_days from plan_configs where plan_id = 'trial';
  v_trial_days := coalesce(v_trial_days, 7);

  insert into public.profiles (id, plan_id, trial_started_at, trial_ends_at)
  values (new.id, 'trial', now(), now() + make_interval(days => v_trial_days))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- No backfill of existing profiles' plan_id here on purpose — every
-- pre-existing account (including the developer/admin one, and anyone
-- claimed via scripts/claim-legacy-data.ts) keeps whatever plan_id it
-- already has. Only accounts created FROM THIS MIGRATION FORWARD default
-- to trial.

-- ---------------------------------------------------------------------------
-- STEP E: trial-aware provider cost period. get_provider_cost_total() and
-- reserve_provider_budget() previously used profiles.created_at as a
-- stand-in "period start" (see 0009's doc comments) since trial dates
-- didn't exist yet. Now that they do, prefer trial_started_at (falling
-- back to created_at for accounts with no trial period, e.g.
-- development/pro) — this is exactly the swap those comments anticipated,
-- and the reason the query shape was kept isolated to one place.
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
      (select trial_started_at from profiles where id = auth.uid()),
      (select created_at from profiles where id = auth.uid()),
      '-infinity'::timestamptz
    );
$$;

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

  select coalesce(trial_started_at, created_at) into v_period_start
    from profiles where id = v_user_id;
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

-- get_usage_total (ai_action / transcription_seconds) already takes an
-- explicit p_period_start from the caller (see lib/entitlements/usage.ts) —
-- no SQL change needed there; the app layer now resolves that start date
-- via lib/entitlements/period.ts's getEntitlementPeriod(), which picks
-- trial_started_at for trial accounts and the calendar month for everyone
-- else, instead of always using the calendar month.
