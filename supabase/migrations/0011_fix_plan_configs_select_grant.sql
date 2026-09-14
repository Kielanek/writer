-- Fixes a bug in 0010_admin_trial_config.sql: `revoke all on plan_configs
-- from anon, authenticated, public` correctly removed write access but
-- also removed the SELECT grant that lib/entitlements/plans.ts's
-- getPlanLimits() relies on to read trial limits via the ordinary session
-- client (that function's own doc comment says "these numbers aren't
-- sensitive... no admin/service-role client is needed just to read them" —
-- the migration just never actually granted it). Every trial user's
-- entitlement check was failing closed to the code fallback, silently
-- masking any admin-configured change.
--
-- Run this in the Supabase SQL editor after 0010_admin_trial_config.sql.

grant select on plan_configs to authenticated;

-- INSERT/UPDATE/DELETE remain revoked for authenticated (and anon/public) —
-- only the admin/secret client (lib/admin/planConfig.ts's
-- updateTrialConfig(), called from the requireAdmin()-gated
-- /api/admin/trial-config route) may write this table.
