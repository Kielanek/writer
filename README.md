# Voice Workspace

A voice-first AI content workspace. Create Projects, capture voice/audio/text
notes, and turn accumulated project knowledge into LinkedIn posts,
newsletters, articles, and summaries — with AI-assisted editing, version
history, and a project-scoped "Ask Project" chat.

Multi-user with Supabase Auth: every Project, Note, Document, Version, Chat
message, and custom Writing Preset belongs to exactly one account, enforced
by Row Level Security — not just application code. No payments or usage
limits yet.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase
(PostgreSQL + Auth, via `@supabase/ssr`) + OpenAI SDK.

## Setup

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then open the SQL
Editor and run every file in `supabase/migrations/` **in order**
(`0001_init.sql` through `0013_allow_zero_cost_usage_events.sql`).
`0006_auth_and_rls.sql` is the Auth migration — it adds `user_id` ownership
columns, indexes, and Row Level Security policies to every user-owned
table, and updates `create_document_version` to enforce and stamp
ownership. `0007_usage_limits.sql` is the Usage/Limits migration — see
[Usage limits](#usage-limits) below. `0008` is a required bugfix for
`0007`'s `create_project_with_limit()` function (it needs
`SECURITY DEFINER`, not `SECURITY INVOKER`, to be able to insert into
`projects` after that same migration revokes direct `INSERT` on it) — don't
skip it. `0009_provider_cost_budget.sql` adds the real-dollar trial cost
budget — see [Provider cost budget (trial safety cap)](#provider-cost-budget-trial-safety-cap)
below. `0010_admin_trial_config.sql` adds the Admin Panel's DB-backed Trial
configuration, trial period dates, and switches new-signup default to
`trial` — see [Admin Panel](#admin-panel) below. `0011` and `0012` are both
required bugfixes for `0010`'s `plan_configs` table: `0010` enabled RLS on
it but left it with neither a `SELECT` grant nor a policy for
`authenticated`, so every trial-limit read via the ordinary session client
silently fell back to code-defined defaults instead of the admin-configured
values — `0011` adds the missing `GRANT`, `0012` adds the missing `POLICY`
(RLS denies all rows with zero policies even once the grant exists — the
grant alone isn't sufficient). Don't skip either. `0013_allow_zero_cost_usage_events.sql`
fixes a real crash (not just a documentation gap): `usage_events.quantity`
had `check (quantity > 0)`, but the provider-cost-budget code in
`lib/entitlements/reservation.ts` deliberately records a legitimate `$0`
usage event when a model has no pricing entry and the current plan has no
cost cap to protect (e.g. `development`/`pro` plans using the
currently-configured `whisper-1` transcription model, which has no
verified price — see [Provider cost budget](#provider-cost-budget-trial-safety-cap)
below). That `$0` insert violated the constraint and crashed **every**
transcription request on **any** plan with a 500, after the real (billable)
OpenAI call had already succeeded. `0013` relaxes the constraint to
`quantity >= 0`. Don't skip it.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=              # Project Settings -> API Keys -> Project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # Project Settings -> API Keys -> Publishable key (safe for the browser)
SUPABASE_SECRET_KEY=                   # Project Settings -> API Keys -> Secret key (server-only, NEVER exposed to the browser)
OPENAI_API_KEY=                        # platform.openai.com
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_TEXT_MODEL=gpt-5.6-terra
ADMIN_USER_IDS=                        # comma-separated Supabase auth user UUIDs — see Admin Panel below
```

If your project still shows the older "Project API keys" panel instead of
"API Keys", the `anon` key is equivalent to the Publishable key and
`service_role` is equivalent to the Secret key — both work as drop-in
replacements (`SUPABASE_SERVICE_ROLE_KEY` is still accepted as a fallback
name for `SUPABASE_SECRET_KEY`).

### 3. Configure Auth redirect URLs (manual, in the Supabase Dashboard)

Go to **Authentication -> URL Configuration**:

- **Site URL**: your app's URL (`http://localhost:3000` for local dev).
- **Redirect URLs**: add `http://localhost:3000/auth/callback` (and your
  production equivalent, e.g. `https://yourapp.com/auth/callback`). This is
  required — Supabase refuses to redirect anywhere not on this list, and
  both signup confirmation and password reset go through
  `/auth/callback`.

Email confirmation is controlled by **Authentication -> Sign In / Providers
-> Email -> "Confirm email"**. The app works either way: if it's on, sign-up
shows "check your email to confirm your account" and the user must click
the link before logging in; if it's off, sign-up logs the user in
immediately.

### 4. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to
`/login` — click through to `/signup` to create your first account. For
voice recording, open the app on your phone (or use Chrome DevTools device
emulation) — the Record Note button uses the browser's `MediaRecorder` API
and requires microphone permission. Recording over the network (not
localhost) requires HTTPS.

### 5. Claim legacy data (only if upgrading an existing single-user database)

Skip this on a brand-new project. If your database already had Projects/
Notes/Documents from before Auth existed, those rows now have `user_id =
null` and are invisible to everyone (RLS hides unowned rows by design) until
you explicitly assign them to your account:

```bash
# 1. Create your account by signing up in the app, then find its UUID in
#    Supabase Dashboard -> Authentication -> Users.

# 2. Dry run first — lists what would be claimed, changes nothing:
npm run claim-legacy-data -- <YOUR_USER_UUID>

# 3. Apply it:
npm run claim-legacy-data -- <YOUR_USER_UUID> --apply
```

This script uses the admin/secret client (bypasses RLS by design), runs only
from your own machine, and is not reachable over HTTP. It's idempotent —
running it again only ever picks up rows still unclaimed.

### Verifying data ownership

- Sign up a second test account and confirm it starts with 0 Projects and
  no visibility into the first account's data (Projects, Notes, Documents,
  Presets, Ask Project).
- In the Supabase SQL Editor (which runs as an admin role, bypassing RLS),
  `select id, user_id from projects` should show every row owned by a real
  user once claimed, and never by both a legacy `null` and a real account at
  once.
- `supabase/tests/rls_verification.sql` runs a full RLS check directly
  against Postgres (own row visible, other user's row invisible, `anon` role
  blocked entirely, spoofed-`user_id` insert rejected, ownership-reassigning
  update rejected) — paste it into the SQL Editor and run it. It's wrapped
  in `begin`/`rollback`, so it never leaves any test data behind.

## Usage limits

Every account has a plan (`development` or `pro`, code-defined in
`lib/entitlements/plans.ts`) with three limits: max Projects, AI Actions per
calendar month, and transcription minutes per calendar month. No Stripe yet
— every new signup gets the `development` plan automatically (via a
Postgres trigger, see below), and its limits are deliberately generous for
testing, not final pricing.

**What counts as an AI Action** (1 action each): Generate Document, AI Edit,
Ask Project, Analyze Writing Examples. Note title/description generation
(automatic, on every note/transcription) is intentionally NOT counted or
limited — charging an invisible side effect of creating a note would be
confusing, and notes are core to the product.

**Transcription** is tracked in seconds internally (shown as minutes in the
UI) and always uses Whisper's own reported audio duration — never a
client-supplied value, which would be easy to fake. Because that duration
isn't known until after transcription completes, the pre-flight check can
only block a request that's already at/over the limit, not cap the exact
amount an in-flight file will use — a single long file can push usage
slightly over before the next one is blocked. This is a deliberate,
documented MVP tradeoff (see `checkTranscriptionAllowance()` in
`lib/entitlements/usage.ts`), not an oversight.

**Where enforcement actually happens**: `lib/entitlements/usage.ts`
(`checkAiActionLimit`, `checkTranscriptionAllowance`, `recordUsageEvent`,
`getUserEntitlements`) is the only place limit logic lives — no route
hardcodes a threshold. A blocked action returns HTTP 429 with
`{"error": "usage_limit_reached", "resource": ..., "used": ..., "limit": ..., "resetsAt": ...}`
(mapped centrally in `lib/utils/api.ts`), and the UI shows a plain message
("You've reached your monthly AI limit. Plan upgrades are coming soon.")
rather than that raw code — see `lib/utils/apiError.ts`.

**Concurrency**: Project creation is fully race-proof — the
`create_project_with_limit()` Postgres function (in
`0007_usage_limits.sql`) serializes concurrent attempts from the same user
with a transaction-scoped advisory lock before counting and inserting, and
`authenticated` has no direct INSERT grant on `projects` at all, so this is
the only way to create one. AI-action and transcription limits are
check-then-record (not reserved), since the "action" is an external OpenAI
call that can take several seconds — two requests fired at nearly the same
instant could both pass the check before either's usage is recorded,
allowing a small overrun bounded by how many requests one user has in
flight at once. Documented rather than solved with a full reservation
ledger, which is out of scope for this MVP.

**New/existing users automatically get a plan**: a `handle_new_user()`
trigger on `auth.users` creates a `profiles` row (`plan_id = 'development'`)
for every signup, and the migration backfills one for every account that
already existed. `getUserPlan()` also has a defensive fallback to the
default plan if a profile is ever missing, so this can never hard-fail a
request.

Verify with `supabase/tests/usage_rls_verification.sql` (same
begin/rollback pattern as the Auth one): a user can read their own
plan/usage and never another user's, cannot change their own `plan_id`
(zero UPDATE grant, for anyone), cannot insert a fake usage event (zero
INSERT grant), `anon` has no access at all, and the project-limit RPC both
assigns ownership correctly and blocks at the limit.

## Provider cost budget (trial safety cap)

On top of the product-facing limits above, the `trial` plan carries a
**hard internal cap on real OpenAI spend for text generation**
(`apiCostBudgetUsd: 0.50` in `lib/entitlements/plans.ts`) — a trial
account can never cost meaningfully more than about $0.50 in actual
text-generation provider fees. This is entirely internal: the user only
ever sees the friendly limits (Projects, AI Actions, Transcription
minutes) — never a dollar figure, never anything resembling "you cost us
$0.37."

**Transcription is deliberately excluded from this $ budget** — it's
gated purely by the 120-minutes/month product limit
(`transcriptionMinutesPerMonth`, enforced by `checkTranscriptionAllowance()`
in `lib/entitlements/usage.ts`). `guardedTranscribeAudio()` in
`lib/ai/guarded.ts` does not reserve, estimate, or record a $ cost at all;
it only checks that the trial hasn't expired. This was a deliberate
product decision: the currently-configured `OPENAI_TRANSCRIPTION_MODEL`
(`whisper-1`) has no verified pricing (see `provider-pricing.ts`), and
rather than chase down real `whisper-1` pricing or switch models, minutes
alone are treated as a sufficient trial safety cap for transcription.

**Pricing config**: `lib/entitlements/provider-pricing.ts` is the *only*
place per-token/per-minute prices live. Currently priced: `gpt-5.6-terra`
(text — $2.00/$0.20/$12.00 per 1M uncached-input/cached-input/output
tokens). `gpt-transcribe` ($0.0045/minute) is also defined for future use,
but nothing currently calls it — see the transcription note above.

**Unknown model safety (text generation only)**: a cost calculation for a
model with no pricing entry throws (`UnknownModelPricingError`) rather
than silently returning $0. For a plan with no cost cap (development,
pro), that's caught, logged, and the action proceeds anyway (nothing to
protect). For a cost-capped plan (trial), it's NOT caught — the action is
blocked and the error is logged server-side, since allowing an unpriced
model through would silently defeat the entire budget. This path no
longer applies to transcription at all (see above).

**Pre-call reservation, not just post-call accounting**: every text-generation
call made by a cost-capped plan reserves a conservative worst-case cost
estimate *before* the request goes out (prompt length ÷ 4 for input tokens
+ a per-feature max-output-tokens ceiling from `FEATURE_COST_GUARDS`,
which is also passed as the real `max_completion_tokens` on the live
request, so it's a true upper bound, not a hope).
`reserve_provider_budget()` (Postgres, in `0009_provider_cost_budget.sql`)
atomically checks that reservation against already-committed cost —
completed spend plus any other still-open reservation — under a per-user
advisory lock, so two simultaneous requests can't both slip under the same
remaining budget. After the real request succeeds, the reservation is
reconciled to the provider's *actual* reported cost (never the estimate);
on failure, it's released with nothing charged.

**Product usage vs. provider usage**: a single user-facing "AI Action" can
involve more than one real OpenAI call (e.g. Article generation followed
by an automatic keyword-repair pass) — every actual call's real cost is
tracked as its own `provider_cost` usage event, independent of the single
`ai_action` product-counter event the user sees. The same split covers
fully automatic calls that never count as an AI Action at all (note
title/description generation) — their cost still counts against the trial
budget, it's just invisible in the "AI Actions used" counter. See
`lib/ai/guarded.ts`'s module doc for the full reasoning.

**Budget period**: the $0.50 budget is NOT calendar-month scoped like the
product limits — it would be a loophole for a trial account to get another
$0.50 just because the month rolled over. It's summed since the account's
`profiles.created_at`, a temporary stand-in for the not-yet-built
`trial_started_at`/`trial_ends_at` (see `get_provider_cost_total()` and
`reserve_provider_budget()`'s doc comments) — swapping to a real trial
period later only changes that one column reference.

**Assigning the trial plan** (no Stripe/signup automation yet):

```bash
npm run set-user-plan -- <USER_UUID> trial
npm run set-user-plan -- <USER_UUID> development   # switch back
```

Your own development account stays on `development` (no cost cap) unless
you explicitly run this. **As of `0010_admin_trial_config.sql`, every NEW
signup defaults to `trial` automatically** — see
[Admin Panel](#admin-panel) below; `set-user-plan` is now mainly useful for
switching an existing account, or for your own dev account if you ever
need to test as a trial user.

Verify with `supabase/tests/provider_cost_rls_verification.sql`: no one
(not even the owning user) can read `provider_cost_reservations` directly,
`reserve_provider_budget()` blocks once exhausted, a different user can't
reconcile/release someone else's reservation, `get_provider_cost_total()`
only ever sums the caller's own cost, and `plan_id` still can't be changed
by the client.

## Admin Panel

`/admin` — Trial configuration and a registered-users list, visible only to
authorized admin accounts.

**Authorization**: a server-only `ADMIN_USER_IDS` env var (comma-separated
Supabase auth user UUIDs), checked against the *validated* session user id
in `lib/admin/auth.ts`'s `requireAdmin()`/`isAdmin()` — never derived from
`plan_id`, email, or anything client-supplied. Every `/api/admin/*` route
calls `requireAdmin()` independently; a non-admin visiting `/admin` or any
admin API gets a plain 404 (indistinguishable from the route not existing)
rather than a 401/403 that would confirm an admin panel exists at all. Get
a user's UUID from Supabase Dashboard -> Authentication -> Users, and put
it in `ADMIN_USER_IDS` in `.env.local` (comma-separate multiple admins).
Your own account is already there if you ran this session's setup.

**New signups now default to `trial`**, not `development` — the
`handle_new_user()` trigger (updated in `0010_admin_trial_config.sql`) sets
`plan_id = 'trial'`, `trial_started_at = now()`, and `trial_ends_at = now()
+ (current plan_configs.trial_days)` on every new `auth.users` row. Nothing
retroactive: every account that already existed (including yours) keeps
whatever `plan_id` it already had.

**Trial limits are DB-backed** (`plan_configs` table, one row for
`plan_id = 'trial'`) and admin-editable from the Trial Settings form —
`development`/`pro` stay code-defined in `lib/entitlements/plans.ts` on
purpose (developer-controlled, not an admin-editable product limit, and
this way local dev is never blocked on a database row existing). A change
to Projects/AI Actions/Transcription/Cost Cap applies to every *current*
trial account immediately (remaining allowance is always `limit − usage`,
computed fresh on every check — there's no per-user snapshot to
invalidate). Changing the trial **duration** only affects brand-new
signups; an existing trial account's `trial_ends_at` is fixed at signup and
is never silently rewritten.

**Trial expiry**: once `now() >= trial_ends_at`, `lib/entitlements/trial.ts`'s
`getTrialStatus()` reports `"expired"`, and `assertTrialActive()` blocks
every entitlement-gated action (AI operations, project creation) with a
structured `{"error": "trial_expired"}` (403) — shown to the user as "Your
trial has ended." Existing Projects/Notes/Documents remain fully readable;
only *new* actions are blocked. No Stripe/upgrade flow yet — a subtle
"Plan upgrades are coming soon" state is all that's shown.

**User list**: sourced from the GoTrue Admin API (`auth.users` — id, email,
created_at, last_sign_in_at) merged server-side with `profiles` and each
user's entitlements (see below), never exposed to the browser directly.
Paginated (25/page) and searchable by email substring or exact user UUID,
newest accounts first. The user detail page (`/admin/users/[userId]`) adds
Project/Document *counts* only — this panel is for account/plan/usage
oversight, never for reading Note/Document/Ask-Project content.

**One source of truth for usage math**: the Admin Panel's per-user numbers
(`lib/admin/entitlements.ts`'s `getEntitlementsForUser()`) are built from
the exact same `buildEntitlementsSnapshot()` function that the self-service
`getUserEntitlements()` (product enforcement) uses — only the raw-data
fetching differs (admin/secret client for an arbitrary user vs. the
session-scoped RPCs for "self"). "Admin says 7/10" and "the backend that
blocks the 11th action sees 7/10" can't diverge. Internal provider cost
(`$0.1834 / $0.50`) IS shown here, admin-only — `GET /api/usage` (the
normal Account page) strips it before responding.

**Audit log**: every Trial Settings change and manual plan override writes
an `admin_audit_log` row (`{admin_user_id, action, metadata: {before,
after}}`) via the admin client — no UI for it yet (`select * from
admin_audit_log order by created_at desc` in the SQL editor if needed).

**Manual plan override** (User Detail page, Set Plan: Trial/Development) is
for testing — not a general plan editor; paid plans arrive with Stripe
later. Switching to Trial starts a fresh trial period from the current
`trial_days` setting; switching to Development clears trial dates entirely.

Verify with `supabase/tests/admin_rls_verification.sql`: `plan_configs` is
readable but never writable by `authenticated`, `admin_audit_log` has zero
access for anyone but the admin/secret client, `profiles`' trial columns
still can't be touched by the client, and a fresh signup gets `trial` +
both trial dates automatically.

## Checks

```bash
npm run lint       # ESLint
npx tsc --noEmit   # Type checking
npm run test       # Vitest — critical business logic (context isolation,
                    # version numbering, restore semantics, metadata
                    # fallback, cascading deletes, usage limits, provider
                    # cost accounting)
```

## Architecture notes

- **Auth: Supabase Auth + `@supabase/ssr`, cookie-based sessions.**
  `lib/supabase/client.ts` (browser, publishable key), `lib/supabase/
  server.ts` (session-aware, RLS-respecting — used for ALL ordinary data
  access via `lib/db/client.ts`), and `lib/supabase/admin.ts` (secret key,
  bypasses RLS, used only by `scripts/claim-legacy-data.ts`). `proxy.ts`
  (Next.js 16's renamed `middleware.ts`) does an optimistic
  redirect-to-`/login` for signed-out visitors and keeps the session cookie
  fresh, but it is not the security boundary — `lib/supabase/auth.ts`'s
  `requireUser()` (calls the validated `auth.getUser()`, never the
  unverified `auth.getSession()`) is called from every `lib/db/*.ts`
  function and gate route, and RLS enforces ownership at the database
  regardless of what application code does or forgets to do.
- **Ownership: a direct `user_id` column on every user-owned table**
  (`projects`, `notes`, `documents`, `document_versions`,
  `project_chat_messages`, `writing_presets`), each with its own RLS
  policies (`auth.uid() = user_id`) rather than relationship/join-based
  policies through `project_id`. Chosen for the MVP because every policy
  stays a single indexed equality check — simple to audit, cheap to
  evaluate, and there's no join condition that could be subtly wrong. Every
  `lib/db/*.ts` query also explicitly filters by `user_id` in application
  code (defense in depth on top of RLS, not instead of it).
- **Context isolation is centralized.** Every AI feature (document
  generation, document editing, Ask Project) pulls Project knowledge through
  a single function, `buildProjectContext(projectId)`
  (`lib/context/buildProjectContext.ts`). It is the only place notes are
  loaded for AI use, and it is strictly scoped by `project_id` — no caller
  can accidentally mix in another Project's notes. The MVP implementation
  returns all of a Project's notes; a future RAG/embeddings implementation
  can replace its internals without changing any caller.
- **Audio is never persisted.** Recorded/uploaded audio is sent directly to
  the transcription endpoint as an in-memory `File`, transcribed, and
  discarded. No audio file path is ever stored — `notes.content` holds only
  the resulting text.
- **AI prompt building is centralized** under `lib/ai/prompts/` (one file
  per use case) rather than scattered through UI components.
- **Version numbering is transactionally safe.** All version writes go
  through the Postgres function `create_document_version`, which locks the
  parent document row, computes `max(version_number) + 1`, and updates the
  document's working content in the same transaction — avoiding duplicate
  version numbers under concurrent requests.
- **Model names are centralized** in `lib/env.ts` and read from
  `OPENAI_TRANSCRIPTION_MODEL` / `OPENAI_TEXT_MODEL` rather than hardcoded
  throughout the codebase.
