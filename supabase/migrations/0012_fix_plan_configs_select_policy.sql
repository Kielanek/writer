-- Fixes the remaining half of 0011's bug: granting SELECT at the table
-- level is necessary but NOT sufficient once Row Level Security is
-- enabled — with zero policies, RLS defaults to denying every row to any
-- non-owner role, regardless of GRANTs. 0010 enabled RLS on plan_configs
-- but never added a policy at all, so even after 0011's grant fix, every
-- read returned zero rows (not a permission error — just silently empty),
-- which is exactly the "trial plan_configs row is missing" fallback path
-- lib/entitlements/plans.ts logs defensively.
--
-- plan_configs is global, non-user-specific configuration (not per-user
-- data), so `using (true)` for SELECT is the correct, safe policy here —
-- unlike every user-owned table in this app, there is no `user_id` to
-- scope by. Write access remains fully locked down (no INSERT/UPDATE/
-- DELETE policy for authenticated at all, and no such grant either).
--
-- Run this in the Supabase SQL editor after
-- 0011_fix_plan_configs_select_grant.sql.

drop policy if exists plan_configs_select_all on plan_configs;
create policy plan_configs_select_all on plan_configs for select
  to authenticated using (true);
