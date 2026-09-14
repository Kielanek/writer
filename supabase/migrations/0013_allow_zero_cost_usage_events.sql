-- Fixes a real crash, not just a documentation gap: usage_events.quantity
-- had `check (quantity > 0)` (from 0007_usage_limits.sql), but
-- lib/entitlements/reservation.ts's resolveEstimateOrFailClosed()
-- deliberately falls back to a cost of exactly 0 when a model has no
-- pricing entry AND the current plan has no cost cap to protect (e.g.
-- development/pro using the currently-configured OPENAI_TRANSCRIPTION_MODEL
-- "whisper-1", which has no verified price in provider-pricing.ts — see
-- that file's doc comment). Recording that $0 event then violated this
-- constraint, throwing an unhandled error that surfaced as a 500 on every
-- transcription request for ANY plan, not just trial — a real regression,
-- not the intentional trial fail-closed behavior.
--
-- $0 is a legitimate value here (it's how "cost genuinely unknown, but
-- this plan has nothing to protect" is recorded), so the fix is to allow
-- it, not to special-case skipping the insert — the row still has
-- diagnostic value (which feature/model hit the unknown-pricing path, and
-- when).
--
-- Run this in the Supabase SQL editor after
-- 0012_fix_plan_configs_select_policy.sql.

alter table usage_events drop constraint if exists usage_events_quantity_check;
alter table usage_events add constraint usage_events_quantity_check check (quantity >= 0);
