-- Project Collaboration: Owner + Members + Invitations, seat-limited by the
-- Owner's plan. Deliberately NOT Workspaces — a Project still belongs to
-- exactly one Owner; collaboration is a set of other users granted access to
-- that Owner's Project, paid for out of the Owner's plan (seats, usage,
-- provider cost). See the app's final report for the full model.
--
-- Run this in the Supabase SQL editor after 0016_seo_meta_in_settings.sql.

-- ---------------------------------------------------------------------------
-- STEP A: plan_configs gains seat_limit (Starter = 1 [owner only, no
-- collaboration], Pro = 3 [owner + up to 2 collaborators]).
-- ---------------------------------------------------------------------------
alter table plan_configs
  add column if not exists seat_limit integer;

update plan_configs set seat_limit = 1 where plan_id = 'starter';
update plan_configs set seat_limit = 3 where plan_id = 'pro';

-- ---------------------------------------------------------------------------
-- STEP B: projects.owner_id — the economic/administrative owner. Backfilled
-- from the existing single-user user_id column, which is left in place
-- (unused by new authorization logic) rather than dropped.
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

update projects set owner_id = user_id where owner_id is null;

alter table projects alter column owner_id set not null;

create index if not exists projects_owner_id_idx on projects (owner_id);

-- ---------------------------------------------------------------------------
-- STEP C: project_members — one row per (project, collaborator). Only
-- 'member' role exists in this MVP (no RBAC beyond Owner/Member). Zero
-- direct write grant for `authenticated` — every mutation goes through the
-- SECURITY DEFINER RPCs below (STEP G), mirroring how this app already
-- treats every other limit/security-sensitive table (plan_configs,
-- admin_audit_log, provider_cost_reservations).
-- ---------------------------------------------------------------------------
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_project_id_idx on project_members (project_id);
create index if not exists project_members_user_id_idx on project_members (user_id);

alter table project_members enable row level security;
revoke all on project_members from anon, authenticated, public;
grant select on project_members to authenticated;

-- ---------------------------------------------------------------------------
-- STEP D: project_invitations — pending/accepted/revoked/expired, keyed by
-- normalized (trimmed, lowercased) email so an invitation can target
-- someone who doesn't have an account yet. A PENDING invitation reserves a
-- seat for its email (see get_owner_seat_usage below) until it's accepted,
-- revoked, or expires. Only one pending invitation per (project, email) at
-- a time (partial unique index). No direct write grant for `authenticated` —
-- same reasoning as project_members.
-- ---------------------------------------------------------------------------
create table if not exists project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create index if not exists project_invitations_project_id_idx on project_invitations (project_id);
create index if not exists project_invitations_email_idx on project_invitations (email);
create unique index if not exists project_invitations_pending_unique_idx
  on project_invitations (project_id, email) where status = 'pending';

alter table project_invitations enable row level security;
revoke all on project_invitations from anon, authenticated, public;
grant select on project_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- STEP E: authorization helper functions. SECURITY DEFINER so they can be
-- used freely inside OTHER tables' RLS policies (notes/documents/etc.)
-- without those policies needing direct grants on projects/project_members,
-- and without risking RLS-recursion subtleties. Narrowly scoped (read-only,
-- single EXISTS checks), safe search_path, STABLE. Defined BEFORE
-- project_collaboration_audit below, since that table's own RLS policy
-- calls is_project_owner().
-- ---------------------------------------------------------------------------
create or replace function is_project_owner(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects where id = p_project_id and owner_id = p_user_id
  );
$$;

create or replace function can_access_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects where id = p_project_id and owner_id = p_user_id
  ) or exists (
    select 1 from project_members where project_id = p_project_id and user_id = p_user_id
  );
$$;

revoke execute on function is_project_owner(uuid, uuid) from public, anon;
grant execute on function is_project_owner(uuid, uuid) to authenticated;
revoke execute on function can_access_project(uuid, uuid) from public, anon;
grant execute on function can_access_project(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP F: project_collaboration_audit — lightweight trail of membership
-- changes (invited/accepted/removed/left/revoked). Same zero-grant posture
-- as admin_audit_log; written only by the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------
create table if not exists project_collaboration_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text,
  action text not null check (
    action in ('member_invited', 'invitation_accepted', 'invitation_revoked', 'invitation_declined', 'member_removed', 'member_left')
  ),
  created_at timestamptz not null default now()
);

create index if not exists project_collaboration_audit_project_id_idx on project_collaboration_audit (project_id, created_at desc);

alter table project_collaboration_audit enable row level security;
revoke all on project_collaboration_audit from anon, authenticated, public;

drop policy if exists project_collaboration_audit_select_owner on project_collaboration_audit;
create policy project_collaboration_audit_select_owner on project_collaboration_audit for select
  to authenticated using (is_project_owner(project_id, auth.uid()));

-- Seat usage: owner + distinct collaborators (accepted members, deduped by
-- email) + distinct emails with a still-pending, unexpired invitation
-- (deduped against members by email too, so a pending re-invite to an
-- already-seated collaborator never double-reserves). Counting by email
-- (not user_id) is what makes "same person, multiple Projects owned by the
-- same Owner = one seat" and "invite an email before they have an account"
-- both work correctly.
create or replace function get_owner_seat_usage(p_owner_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(distinct identity)::integer from (
    select lower(u.email) as identity from auth.users u where u.id = p_owner_id
    union
    select lower(mu.email) as identity
    from project_members pm
    join projects pr on pr.id = pm.project_id
    join auth.users mu on mu.id = pm.user_id
    where pr.owner_id = p_owner_id
    union
    select pi.email as identity
    from project_invitations pi
    join projects pr on pr.id = pi.project_id
    where pr.owner_id = p_owner_id and pi.status = 'pending' and pi.expires_at > now()
  ) t;
$$;

revoke execute on function get_owner_seat_usage(uuid) from public, anon;
grant execute on function get_owner_seat_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP G: collaboration RPCs. Every one derives the acting user EXCLUSIVELY
-- from auth.uid() (never a parameter) and re-verifies authorization inside
-- the function itself — callable safely via the ordinary session client.
-- Seat-limit enforcement is inside a per-owner advisory-xact-lock, the same
-- pattern create_project_with_limit()/reserve_provider_budget() already use,
-- so two simultaneous invitations can't both slip under the same remaining
-- seat.
-- ---------------------------------------------------------------------------

create or replace function invite_project_member(
  p_project_id uuid,
  p_email text
) returns project_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_owner_email text;
  v_plan_id text;
  v_seat_limit integer;
  v_seat_usage integer;
  v_already_seated boolean;
  v_email text := lower(trim(p_email));
  v_row project_invitations;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  select owner_id into v_owner_id from projects where id = p_project_id;
  if v_owner_id is null then raise exception 'project_not_found'; end if;
  if v_owner_id <> v_actor then raise exception 'not_project_owner'; end if;

  select email into v_owner_email from auth.users where id = v_owner_id;
  if v_email = lower(v_owner_email) then raise exception 'cannot_invite_owner'; end if;

  -- Serializes concurrent invite/accept/remove for this Owner so seat
  -- checks below are never based on a stale count.
  perform pg_advisory_xact_lock(hashtext('seats:' || v_owner_id::text));

  if exists (
    select 1 from project_members pm join auth.users u on u.id = pm.user_id
    where pm.project_id = p_project_id and lower(u.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  if exists (
    select 1 from project_invitations
    where project_id = p_project_id and email = v_email and status = 'pending' and expires_at > now()
  ) then
    raise exception 'already_invited';
  end if;

  -- Does this email already occupy a seat for this Owner (member of, or
  -- already pending on, any of the Owner's OTHER Projects)? If so, adding
  -- them to this Project too must not consume another seat.
  select exists (
    select 1
    from project_members pm
    join projects pr on pr.id = pm.project_id
    join auth.users u on u.id = pm.user_id
    where pr.owner_id = v_owner_id and lower(u.email) = v_email
    union
    select 1
    from project_invitations pi
    join projects pr on pr.id = pi.project_id
    where pr.owner_id = v_owner_id and pi.email = v_email and pi.status = 'pending' and pi.expires_at > now()
  ) into v_already_seated;

  if not v_already_seated then
    select plan_id into v_plan_id from profiles where id = v_owner_id;

    select seat_limit into v_seat_limit from plan_configs where plan_id = v_plan_id;
    if v_seat_limit is null then
      v_seat_limit := case v_plan_id when 'starter' then 1 when 'pro' then 3 else 2147483647 end;
    end if;

    select get_owner_seat_usage(v_owner_id) into v_seat_usage;

    if v_seat_usage >= v_seat_limit then
      raise exception 'seat_limit_reached';
    end if;
  end if;

  insert into project_invitations (project_id, email, invited_by, role, status)
  values (p_project_id, v_email, v_actor, 'member', 'pending')
  returning * into v_row;

  insert into project_collaboration_audit (project_id, actor_user_id, target_email, action)
  values (p_project_id, v_actor, v_email, 'member_invited');

  return v_row;
end;
$$;

create or replace function accept_project_invitation(p_invitation_id uuid)
returns project_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_invite project_invitations;
  v_owner_id uuid;
  v_row project_members;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select email into v_actor_email from auth.users where id = v_actor;

  select * into v_invite from project_invitations where id = p_invitation_id for update;
  if v_invite.id is null then raise exception 'invitation_not_found'; end if;
  if v_invite.status <> 'pending' then raise exception 'invitation_not_pending'; end if;
  if v_invite.expires_at <= now() then
    update project_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'invitation_expired';
  end if;
  if lower(v_actor_email) <> v_invite.email then raise exception 'invitation_email_mismatch'; end if;

  select owner_id into v_owner_id from projects where id = v_invite.project_id;
  if v_owner_id is null then raise exception 'project_not_found'; end if;
  if v_owner_id = v_actor then raise exception 'cannot_invite_owner'; end if;

  perform pg_advisory_xact_lock(hashtext('seats:' || v_owner_id::text));

  insert into project_members (project_id, user_id, role, added_by)
  values (v_invite.project_id, v_actor, 'member', v_invite.invited_by)
  on conflict (project_id, user_id) do nothing
  returning * into v_row;

  update project_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = v_actor
    where id = p_invitation_id;

  if v_row.id is null then
    select * into v_row from project_members where project_id = v_invite.project_id and user_id = v_actor;
  end if;

  insert into project_collaboration_audit (project_id, actor_user_id, target_user_id, target_email, action)
  values (v_invite.project_id, v_actor, v_actor, v_invite.email, 'invitation_accepted');

  return v_row;
end;
$$;

create or replace function decline_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_invite project_invitations;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select email into v_actor_email from auth.users where id = v_actor;

  select * into v_invite from project_invitations where id = p_invitation_id for update;
  if v_invite.id is null then raise exception 'invitation_not_found'; end if;
  if v_invite.status <> 'pending' then raise exception 'invitation_not_pending'; end if;
  if lower(v_actor_email) <> v_invite.email then raise exception 'invitation_email_mismatch'; end if;

  update project_invitations set status = 'revoked' where id = p_invitation_id;

  insert into project_collaboration_audit (project_id, actor_user_id, target_email, action)
  values (v_invite.project_id, v_actor, v_invite.email, 'invitation_declined');
end;
$$;

create or replace function revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_invite project_invitations;
  v_owner_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_invite from project_invitations where id = p_invitation_id for update;
  if v_invite.id is null then raise exception 'invitation_not_found'; end if;

  select owner_id into v_owner_id from projects where id = v_invite.project_id;
  if v_owner_id <> v_actor then raise exception 'not_project_owner'; end if;

  if v_invite.status = 'pending' then
    update project_invitations set status = 'revoked' where id = p_invitation_id;
    insert into project_collaboration_audit (project_id, actor_user_id, target_email, action)
    values (v_invite.project_id, v_actor, v_invite.email, 'invitation_revoked');
  end if;
end;
$$;

create or replace function remove_project_member(p_project_id uuid, p_member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select owner_id into v_owner_id from projects where id = p_project_id;
  if v_owner_id is null then raise exception 'project_not_found'; end if;
  if v_owner_id <> v_actor then raise exception 'not_project_owner'; end if;

  delete from project_members where project_id = p_project_id and user_id = p_member_user_id;

  insert into project_collaboration_audit (project_id, actor_user_id, target_user_id, action)
  values (p_project_id, v_actor, p_member_user_id, 'member_removed');
end;
$$;

create or replace function leave_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select owner_id into v_owner_id from projects where id = p_project_id;
  if v_owner_id is null then raise exception 'project_not_found'; end if;
  if v_owner_id = v_actor then raise exception 'owner_cannot_leave'; end if;

  delete from project_members where project_id = p_project_id and user_id = v_actor;

  insert into project_collaboration_audit (project_id, actor_user_id, target_user_id, action)
  values (p_project_id, v_actor, v_actor, 'member_left');
end;
$$;

revoke execute on function invite_project_member(uuid, text) from public, anon;
grant execute on function invite_project_member(uuid, text) to authenticated;
revoke execute on function accept_project_invitation(uuid) from public, anon;
grant execute on function accept_project_invitation(uuid) to authenticated;
revoke execute on function decline_project_invitation(uuid) from public, anon;
grant execute on function decline_project_invitation(uuid) to authenticated;
revoke execute on function revoke_project_invitation(uuid) from public, anon;
grant execute on function revoke_project_invitation(uuid) to authenticated;
revoke execute on function remove_project_member(uuid, uuid) from public, anon;
grant execute on function remove_project_member(uuid, uuid) to authenticated;
revoke execute on function leave_project(uuid) from public, anon;
grant execute on function leave_project(uuid) to authenticated;

-- project_invitations SELECT: the Project Owner sees invitations they sent;
-- the invited person (matched by their OWN verified JWT email — never a
-- client-supplied value) sees invitations addressed to them, so they can
-- list and accept/decline. auth.email() reads the email claim straight off
-- the validated session JWT.
drop policy if exists project_invitations_select on project_invitations;
create policy project_invitations_select on project_invitations for select
  to authenticated using (
    is_project_owner(project_id, auth.uid()) or email = lower(auth.email())
  );

drop policy if exists project_members_select on project_members;
create policy project_members_select on project_members for select
  to authenticated using (can_access_project(project_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- STEP H: rewrite projects RLS for owner-or-member access. UPDATE/DELETE
-- remain Owner-only (Members cannot rename/delete a shared Project or change
-- its owner); INSERT still stamps the creator as owner_id, never accepted
-- from the client as a column value that could name someone else.
-- ---------------------------------------------------------------------------
drop policy if exists projects_select_own on projects;
create policy projects_select_own on projects for select
  to authenticated using (owner_id = auth.uid() or can_access_project(id, auth.uid()));

drop policy if exists projects_insert_own on projects;
create policy projects_insert_own on projects for insert
  to authenticated with check (owner_id = auth.uid());

drop policy if exists projects_update_own on projects;
create policy projects_update_own on projects for update
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects for delete
  to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- STEP I: child-resource RLS (notes, documents, document_versions,
-- project_chat_messages) now grants access via PROJECT membership, not the
-- resource's own user_id — this is what lets two people work on the same
-- shared Note/Document. user_id on these tables is kept as "creator"
-- attribution only, never the access boundary, per the app's collaboration
-- model. document_versions has no project_id column of its own, so its
-- policies check access through the parent document.
-- ---------------------------------------------------------------------------

-- notes ----------------------------------------------------------------
drop policy if exists notes_select_own on notes;
create policy notes_select_own on notes for select
  to authenticated using (can_access_project(project_id, auth.uid()));

drop policy if exists notes_insert_own on notes;
create policy notes_insert_own on notes for insert
  to authenticated with check (can_access_project(project_id, auth.uid()));

drop policy if exists notes_update_own on notes;
create policy notes_update_own on notes for update
  to authenticated using (can_access_project(project_id, auth.uid())) with check (can_access_project(project_id, auth.uid()));

drop policy if exists notes_delete_own on notes;
create policy notes_delete_own on notes for delete
  to authenticated using (can_access_project(project_id, auth.uid()));

-- documents ---------------------------------------------------------------
drop policy if exists documents_select_own on documents;
create policy documents_select_own on documents for select
  to authenticated using (can_access_project(project_id, auth.uid()));

drop policy if exists documents_insert_own on documents;
create policy documents_insert_own on documents for insert
  to authenticated with check (can_access_project(project_id, auth.uid()));

drop policy if exists documents_update_own on documents;
create policy documents_update_own on documents for update
  to authenticated using (can_access_project(project_id, auth.uid())) with check (can_access_project(project_id, auth.uid()));

drop policy if exists documents_delete_own on documents;
create policy documents_delete_own on documents for delete
  to authenticated using (can_access_project(project_id, auth.uid()));

-- document_versions (via parent document's project) -----------------------
drop policy if exists document_versions_select_own on document_versions;
create policy document_versions_select_own on document_versions for select
  to authenticated using (
    exists (select 1 from documents d where d.id = document_versions.document_id and can_access_project(d.project_id, auth.uid()))
  );

drop policy if exists document_versions_insert_own on document_versions;
create policy document_versions_insert_own on document_versions for insert
  to authenticated with check (
    exists (select 1 from documents d where d.id = document_versions.document_id and can_access_project(d.project_id, auth.uid()))
  );

-- project_chat_messages -------------------------------------------------
drop policy if exists project_chat_messages_select_own on project_chat_messages;
create policy project_chat_messages_select_own on project_chat_messages for select
  to authenticated using (can_access_project(project_id, auth.uid()));

drop policy if exists project_chat_messages_insert_own on project_chat_messages;
create policy project_chat_messages_insert_own on project_chat_messages for insert
  to authenticated with check (can_access_project(project_id, auth.uid()));

drop policy if exists project_chat_messages_delete_own on project_chat_messages;
create policy project_chat_messages_delete_own on project_chat_messages for delete
  to authenticated using (can_access_project(project_id, auth.uid()));

-- writing_presets: DELIBERATELY UNCHANGED — presets remain personal to
-- whoever created them, never shared by Project membership (see the app's
-- final report, "Presets remain user-owned").

-- ---------------------------------------------------------------------------
-- STEP J: create_project_with_limit now counts/inserts against owner_id
-- (always the caller — a user can only ever create Projects they own) and
-- the seat/limit check remains scoped to the Owner's own Projects, matching
-- "shared Projects don't count against a Member's limit."
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

  select count(*) into v_count from projects where owner_id = v_user_id;

  if v_count >= p_max_projects then
    raise exception 'project_limit_reached';
  end if;

  insert into projects (user_id, owner_id, name, description)
  values (v_user_id, v_user_id, p_name, p_description)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP K: create_document_version now stamps created_by (the real acting
-- user — may differ from the Document's own user_id "creator" column once a
-- collaborator edits someone else's Document) alongside the existing
-- content/seo_settings snapshot. Access is already covered by the
-- documents_select_own policy above (project-based), which this function's
-- `select ... for update` is itself subject to.
-- ---------------------------------------------------------------------------
alter table document_versions
  add column if not exists created_by uuid references auth.users (id) on delete set null;

update document_versions set created_by = user_id where created_by is null;

create or replace function create_document_version(
  p_document_id uuid,
  p_content text,
  p_source text,
  p_instruction text default null,
  p_restored_from_version integer default null,
  p_seo_settings jsonb default null
) returns document_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_next_version integer;
  v_row document_versions;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Subject to documents_select_own's project-based RLS: v_owner comes back
  -- null both when the Document truly doesn't exist AND when the caller has
  -- no access to its Project — same "no existence disclosure" property as
  -- before.
  select user_id into v_owner from documents where id = p_document_id for update;

  if v_owner is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from document_versions
    where document_id = p_document_id;

  insert into document_versions (
    document_id, version_number, content, source, instruction, restored_from_version, user_id, seo_settings, created_by
  ) values (
    p_document_id, v_next_version, p_content, p_source, p_instruction, p_restored_from_version, v_owner, p_seo_settings, v_actor
  )
  returning * into v_row;

  update documents
    set content = p_content,
        seo_settings = coalesce(p_seo_settings, seo_settings),
        updated_at = now()
    where id = p_document_id;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP L: usage_events gains actor_user_id (who actually performed the
-- action) and project_id (which Project it happened in, if any) — user_id
-- keeps meaning "billing owner" exactly as before (unchanged for every
-- historical row, backfilled equal to actor_user_id so old rows read as
-- "actor billed themselves," which is exactly what was true pre-collaboration).
-- ---------------------------------------------------------------------------
alter table usage_events
  add column if not exists actor_user_id uuid references auth.users (id) on delete set null,
  add column if not exists project_id uuid references projects (id) on delete set null;

update usage_events set actor_user_id = user_id where actor_user_id is null;

create index if not exists usage_events_actor_user_id_idx on usage_events (actor_user_id);
create index if not exists usage_events_project_id_idx on usage_events (project_id);

-- ---------------------------------------------------------------------------
-- STEP M: provider-cost functions now take an explicit p_user_id (the
-- BILLING owner, resolved server-side — see lib/entitlements/reservation.ts)
-- instead of deriving it from auth.uid(). These are called exclusively via
-- the admin/secret client from already-authorized server code (the calling
-- Next.js route has already verified, via a project access check, that the
-- session's real actor may spend against p_user_id) — the same trust model
-- this app already uses for recordUsageEvent()/applyPlanChange(). Direct
-- client calls are blocked: zero grant to `authenticated`.
-- ---------------------------------------------------------------------------
drop function if exists get_provider_cost_total(timestamptz);
drop function if exists reserve_provider_budget(text, numeric, numeric, timestamptz);
drop function if exists reconcile_provider_reservation(uuid, numeric, jsonb);
drop function if exists release_provider_reservation(uuid);

create or replace function get_provider_cost_total(
  p_user_id uuid,
  p_period_start timestamptz default '-infinity'::timestamptz
) returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(quantity), 0)
  from usage_events
  where user_id = p_user_id
    and event_type = 'provider_cost'
    and created_at >= p_period_start;
$$;

create or replace function reserve_provider_budget(
  p_user_id uuid,
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
  v_committed numeric;
  v_row provider_cost_reservations;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('provider_budget:' || p_user_id::text));

  select
    coalesce((
      select sum(quantity) from usage_events
      where user_id = p_user_id and event_type = 'provider_cost' and created_at >= p_period_start
    ), 0)
    +
    coalesce((
      select sum(reserved_cost_usd) from provider_cost_reservations
      where user_id = p_user_id and status = 'reserved'
    ), 0)
  into v_committed;

  if v_committed + p_reserved_cost_usd > p_budget_limit_usd then
    raise exception 'provider_budget_exhausted';
  end if;

  insert into provider_cost_reservations (user_id, feature, reserved_cost_usd, status)
  values (p_user_id, p_feature, p_reserved_cost_usd, 'reserved')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function reconcile_provider_reservation(
  p_user_id uuid,
  p_reservation_id uuid,
  p_actual_cost_usd numeric,
  p_actor_user_id uuid default null,
  p_project_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns provider_cost_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row provider_cost_reservations;
begin
  update provider_cost_reservations
    set status = 'completed', actual_cost_usd = p_actual_cost_usd, completed_at = now()
    where id = p_reservation_id and user_id = p_user_id and status = 'reserved'
    returning * into v_row;

  if v_row.id is null then
    raise exception 'reservation_not_found';
  end if;

  insert into usage_events (user_id, actor_user_id, project_id, event_type, quantity, metadata)
  values (
    p_user_id,
    coalesce(p_actor_user_id, p_user_id),
    p_project_id,
    'provider_cost',
    p_actual_cost_usd,
    p_metadata || jsonb_build_object('feature', v_row.feature)
  );

  return v_row;
end;
$$;

create or replace function release_provider_reservation(
  p_user_id uuid,
  p_reservation_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update provider_cost_reservations
    set status = 'released', completed_at = now()
    where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
end;
$$;

revoke execute on function get_provider_cost_total(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function reserve_provider_budget(uuid, text, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke execute on function reconcile_provider_reservation(uuid, uuid, numeric, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function release_provider_reservation(uuid, uuid) from public, anon, authenticated;

-- get_usage_total (ai_action / transcription_seconds) is LEFT UNCHANGED —
-- still session-scoped (auth.uid()), used only by the self-service Account
-- page. Project-scoped billing-owner usage totals are summed directly by
-- the app server via the admin/secret client (see
-- lib/entitlements/usage.ts's getUsageTotalForUser()), the same technique
-- the Admin Panel's per-user view already used before this migration.
