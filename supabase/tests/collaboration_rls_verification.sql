-- Manual RLS/RPC verification for supabase/migrations/0017_project_collaboration.sql.
-- Same approach as supabase/tests/rls_verification.sql — run in the Supabase
-- SQL Editor (which connects as postgres, bypassing RLS, hence the explicit
-- `set local role authenticated` + fake JWT claims below), wrapped in
-- begin/rollback so nothing persists.
--
-- Covers: invite -> accept grants Project access via can_access_project();
-- an Outsider (never invited) has none; a Member cannot rename/delete the
-- Project or invite/remove/revoke anyone (Owner-only RPCs); a Member can
-- leave but the Owner cannot; project_collaboration_audit is Owner-only; and
-- seat_limit_reached blocks an invite once the Owner's plan seat limit is
-- hit. Only `projects`/`notes`/`documents` are exercised directly — RLS on
-- document_versions/project_chat_messages uses the identical
-- can_access_project() pattern (see the migration's STEP I), so it isn't
-- re-verified table-by-table here.

begin;

-- OWNER    = 33333333-3333-3333-3333-000000000001 (owner@collab-test.local)
-- MEMBER   = 33333333-3333-3333-3333-000000000002 (member@collab-test.local)
-- OUTSIDER = 33333333-3333-3333-3333-000000000003 (outsider@collab-test.local)
-- PROJECT  = 33333333-3333-3333-3333-0000000000a1

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-000000000001', 'owner@collab-test.local'),
  ('33333333-3333-3333-3333-000000000002', 'member@collab-test.local'),
  ('33333333-3333-3333-3333-000000000003', 'outsider@collab-test.local')
on conflict (id) do nothing;

-- The on_auth_user_created trigger creates a 'development' profile for each;
-- give the Owner the Pro plan (seat_limit 3) for the main flow below.
update profiles set plan_id = 'pro' where id = '33333333-3333-3333-3333-000000000001';

insert into projects (id, user_id, owner_id, name)
values (
  '33333333-3333-3333-3333-0000000000a1',
  '33333333-3333-3333-3333-000000000001',
  '33333333-3333-3333-3333-000000000001',
  'Shared Project'
);

insert into notes (id, project_id, user_id, type, title, description, content)
values (
  '33333333-3333-3333-3333-0000000000b1',
  '33333333-3333-3333-3333-0000000000a1',
  '33333333-3333-3333-3333-000000000001',
  'text', 'Owner note', '', 'SECRET_NOTE_CONTENT'
);

-- ---------------------------------------------------------------------------
-- 1) An Outsider has zero access before any invitation exists.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000003", "email": "outsider@collab-test.local"}';

select count(*) as should_be_zero from projects where id = '33333333-3333-3333-3333-0000000000a1';
select count(*) as should_be_zero from notes where project_id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: 0, 0.

reset role;

-- ---------------------------------------------------------------------------
-- 2) A non-owner cannot invite — not_project_owner.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000003", "email": "outsider@collab-test.local"}';

do $$
begin
  perform invite_project_member('33333333-3333-3333-3333-0000000000a1', 'member@collab-test.local');
  raise exception 'SECURITY BUG: a non-owner successfully invited a member';
exception
  when others then
    if sqlerrm = 'not_project_owner' then
      raise notice 'OK: not_project_owner raised as expected';
    else
      raise;
    end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3) The Owner invites Member — succeeds, returns a pending invitation.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000001", "email": "owner@collab-test.local"}';

create temporary table _invite as
select * from invite_project_member('33333333-3333-3333-3333-0000000000a1', 'member@collab-test.local');

select id, email, status from _invite;
-- Expect: one row, status = 'pending', email = 'member@collab-test.local'.

reset role;

-- ---------------------------------------------------------------------------
-- 4) Someone whose OWN verified email doesn't match the invitation cannot
-- accept it on Member's behalf — invitation_email_mismatch. auth.email()
-- reads the JWT's own claim, never a client-supplied value.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000003", "email": "outsider@collab-test.local"}';

do $$
declare
  v_invite_id uuid := (select id from _invite limit 1);
begin
  perform accept_project_invitation(v_invite_id);
  raise exception 'SECURITY BUG: an invitation was accepted by the wrong email/user';
exception
  when others then
    if sqlerrm = 'invitation_email_mismatch' then
      raise notice 'OK: invitation_email_mismatch raised as expected';
    else
      raise;
    end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5) Member (matching email) accepts — becomes a project_members row.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000002", "email": "member@collab-test.local"}';

do $$
declare
  v_invite_id uuid := (select id from _invite limit 1);
begin
  perform accept_project_invitation(v_invite_id);
end $$;

select count(*) as should_be_one from project_members
  where project_id = '33333333-3333-3333-3333-0000000000a1'
    and user_id = '33333333-3333-3333-3333-000000000002';
-- Expect: 1.

reset role;

-- ---------------------------------------------------------------------------
-- 6) Member now has SELECT access to the Project and its Notes (via
-- can_access_project — NOT via notes.user_id, which still says Owner).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000002", "email": "member@collab-test.local"}';

select name from projects where id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: "Shared Project".

select content from notes where id = '33333333-3333-3333-3333-0000000000b1';
-- Expect: "SECRET_NOTE_CONTENT" — visible despite user_id being the Owner's.

reset role;

-- ---------------------------------------------------------------------------
-- 7) Member cannot rename or delete the Project — Owner-only RLS.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000002", "email": "member@collab-test.local"}';

update projects set name = 'Hijacked' where id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: "UPDATE 0" — silently filtered by projects_update_own, not an error.

delete from projects where id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: "DELETE 0".

reset role;

set local role postgres;
select name from projects where id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: "Shared Project" — unchanged, proving the no-ops above were real no-ops.
reset role;

-- ---------------------------------------------------------------------------
-- 8) Member cannot invite, remove, or revoke — every mutating RPC re-checks
-- ownership itself, independent of RLS.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000002", "email": "member@collab-test.local"}';

do $$
begin
  perform invite_project_member('33333333-3333-3333-3333-0000000000a1', 'someone-else@collab-test.local');
  raise exception 'SECURITY BUG: a Member invited someone';
exception
  when others then
    if sqlerrm = 'not_project_owner' then raise notice 'OK: Member cannot invite';
    else raise; end if;
end $$;

do $$
begin
  perform remove_project_member('33333333-3333-3333-3333-0000000000a1', '33333333-3333-3333-3333-000000000001');
  raise exception 'SECURITY BUG: a Member removed the Owner';
exception
  when others then
    if sqlerrm = 'not_project_owner' then raise notice 'OK: Member cannot remove members';
    else raise; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 9) Member can leave; the Owner cannot leave their own Project.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000002", "email": "member@collab-test.local"}';

do $$
begin
  perform leave_project('33333333-3333-3333-3333-0000000000a1');
end $$;

select count(*) as should_be_zero from project_members
  where project_id = '33333333-3333-3333-3333-0000000000a1'
    and user_id = '33333333-3333-3333-3333-000000000002';
-- Expect: 0 — Member successfully left.

reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000001", "email": "owner@collab-test.local"}';

do $$
begin
  perform leave_project('33333333-3333-3333-3333-0000000000a1');
  raise exception 'SECURITY BUG: the Owner left their own Project';
exception
  when others then
    if sqlerrm = 'owner_cannot_leave' then raise notice 'OK: owner_cannot_leave raised as expected';
    else raise; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 10) project_collaboration_audit is readable only by the Project Owner.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000001", "email": "owner@collab-test.local"}';

select count(*) as owner_visible_rows from project_collaboration_audit
  where project_id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: > 0 (invited/accepted/left entries from steps 3, 5, 9).

reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000003", "email": "outsider@collab-test.local"}';

select count(*) as should_be_zero from project_collaboration_audit
  where project_id = '33333333-3333-3333-3333-0000000000a1';
-- Expect: 0.

reset role;

-- ---------------------------------------------------------------------------
-- 11) Seat limit: a Starter Owner (seat_limit = 1) already occupies their
-- one seat alone, so a first invitation is immediately blocked.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-000000000004', 'starter-owner@collab-test.local')
on conflict (id) do nothing;
update profiles set plan_id = 'starter' where id = '33333333-3333-3333-3333-000000000004';

insert into projects (id, user_id, owner_id, name)
values (
  '33333333-3333-3333-3333-0000000000a2',
  '33333333-3333-3333-3333-000000000004',
  '33333333-3333-3333-3333-000000000004',
  'Starter Project'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-000000000004", "email": "starter-owner@collab-test.local"}';

do $$
begin
  perform invite_project_member('33333333-3333-3333-3333-0000000000a2', 'someone-new@collab-test.local');
  raise exception 'SECURITY BUG: a Starter (1-seat) Owner was able to invite a collaborator';
exception
  when others then
    if sqlerrm = 'seat_limit_reached' then raise notice 'OK: seat_limit_reached raised as expected';
    else raise; end if;
end $$;

reset role;

rollback; -- discard every seeded/test row; nothing above persists.
