-- Fixes a bug in 0007_usage_limits.sql: create_project_with_limit() was
-- declared `security invoker`, but that same migration revokes INSERT on
-- `projects` from `authenticated` (on purpose — see 0007's comment on why
-- this RPC must be the only way to create a Project). Under SECURITY
-- INVOKER, the function's own `insert into projects` runs with the
-- CALLER's privileges, so it hit the exact same revoked grant every normal
-- user now has: "permission denied for table projects".
--
-- Fix: SECURITY DEFINER, so the function runs with its owner's privileges
-- (bypassing the revoked grant) while the function body still derives
-- ownership exclusively from auth.uid() — never a parameter — so this
-- doesn't reopen any spoofing surface. set search_path stays pinned to
-- guard against search_path hijacking, which matters more, not less, once
-- a function is SECURITY DEFINER.
--
-- Run this in the Supabase SQL editor after 0007_usage_limits.sql.

create or replace function create_project_with_limit(
  p_name text,
  p_description text,
  p_max_projects integer
) returns projects
language plpgsql
security definer
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
