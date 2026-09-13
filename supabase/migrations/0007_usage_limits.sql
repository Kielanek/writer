-- Usage Tracking + Limits: internal entitlement architecture that a future
-- Stripe integration will plug into (plan assignment, billing period, and
-- subscription status can all be swapped out later without rewriting usage
-- tracking or the enforcement call sites).
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) after
-- 0006_auth_and_rls.sql.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, carrying plan assignment. No billing
-- fields yet on purpose (see lib/entitlements/plans.ts) — a future Stripe
-- migration adds columns here, it doesn't replace this table.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'development' check (plan_id in ('development', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on profiles;
create trigger set_updated_at before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select
  to authenticated using (id = auth.uid());

-- No insert/update/delete policy for `authenticated` at all: plan_id must
-- only ever change via trusted server-side logic (the trigger below today;
-- a Stripe webhook using the admin client later) — a user has zero write
-- access to this table, period.
revoke all on profiles from anon, public;
grant select on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- usage_events: append-only ledger of billable actions. `quantity` is
-- always server-computed (see lib/entitlements/usage.ts) — never trust a
-- client-supplied amount for something users have an incentive to fake.
-- ---------------------------------------------------------------------------
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('ai_action', 'transcription_seconds')),
  quantity numeric not null check (quantity > 0),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Every usage query filters by (user_id, event_type, created_at >= period
-- start) — see get_usage_total() below.
create index if not exists usage_events_user_period_idx
  on usage_events (user_id, event_type, created_at);

alter table usage_events enable row level security;

drop policy if exists usage_events_select_own on usage_events;
create policy usage_events_select_own on usage_events for select
  to authenticated using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated`: a user must not be
-- able to inject fake usage, alter, or erase their own history. Usage is
-- recorded exclusively by the server via the admin/secret client (bypasses
-- RLS by design — see lib/entitlements/usage.ts's recordUsageEvent), which
-- is the same "genuinely privileged, explicitly invoked" pattern already
-- used by scripts/claim-legacy-data.ts.
revoke all on usage_events from anon, public;
grant select on usage_events to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row for every new signup, defaulting to the
-- baseline "development" plan. SECURITY DEFINER so it can write to
-- `profiles` despite the table having no INSERT policy for anyone.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan_id)
  values (new.id, 'development')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: any account created before this migration existed (including
-- everyone claimed via scripts/claim-legacy-data.ts) gets a profile too, so
-- getUserPlan()'s defensive fallback is a safety net, not a requirement.
insert into public.profiles (id, plan_id)
select id, 'development' from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- get_usage_total: the one place "how much of X has this user used in the
-- current period" is computed. SECURITY INVOKER (default, kept explicit) —
-- always reads auth.uid() itself rather than trusting a passed-in user id,
-- so it can never be used to read another user's usage even if called
-- directly.
-- ---------------------------------------------------------------------------
create or replace function get_usage_total(
  p_event_type text,
  p_period_start timestamptz
) returns numeric
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(sum(quantity), 0)
  from usage_events
  where user_id = auth.uid()
    and event_type = p_event_type
    and created_at >= p_period_start;
$$;

revoke execute on function get_usage_total(text, timestamptz) from public, anon;
grant execute on function get_usage_total(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- create_project_with_limit: the ONLY way an authenticated user can create
-- a Project (see the INSERT revoke below). Wraps the "count existing
-- projects, then insert" check in one function call, serialized per-user
-- with a transaction-scoped advisory lock, so two concurrent requests from
-- the same user can't both observe "count < limit" and both insert,
-- pushing them over it. p_max_projects comes from the caller (the current
-- plan's maxProjects, resolved in lib/entitlements/plans.ts) since plan
-- configuration lives in application code, not the database.
-- ---------------------------------------------------------------------------
create or replace function create_project_with_limit(
  p_name text,
  p_description text,
  p_max_projects integer
) returns projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_row projects;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select count(*) into v_count from projects where user_id = v_user_id;

  if v_count >= p_max_projects then
    raise exception 'project_limit_reached';
  end if;

  insert into projects (user_id, name, description)
  values (v_user_id, p_name, p_description)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function create_project_with_limit(text, text, integer) from public, anon;
grant execute on function create_project_with_limit(text, text, integer) to authenticated;

-- Direct INSERT on projects is revoked from `authenticated`: creating a
-- Project now only happens through create_project_with_limit above, so the
-- project-count limit can never be bypassed by a client calling the
-- PostgREST API directly instead of going through the app's route. select/
-- update/delete on projects are unaffected — only creation is gated.
revoke insert on projects from authenticated;
