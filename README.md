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
(`0001_init.sql` through `0009_provider_cost_budget.sql`).
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
below.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=              # Project Settings -> API Keys -> Project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # Project Settings -> API Keys -> Publishable key (safe for the browser)
SUPABASE_SECRET_KEY=                   # Project Settings -> API Keys -> Secret key (server-only, NEVER exposed to the browser)
OPENAI_API_KEY=                        # platform.openai.com
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_TEXT_MODEL=gpt-5.6-terra
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
**hard internal cap on real OpenAI spend** (`apiCostBudgetUsd: 0.50` in
`lib/entitlements/plans.ts`) — a trial account can never cost meaningfully
more than about $0.50 in actual provider fees, independent of how the
Projects/AI Actions/Transcription numbers are tuned. This is entirely
internal: the user only ever sees the friendly limits (Projects, AI
Actions, Transcription minutes) — never a dollar figure, never anything
resembling "you cost us $0.37."

**Pricing config**: `lib/entitlements/provider-pricing.ts` is the *only*
place per-token/per-minute prices live. Currently priced: `gpt-5.6-terra`
(text — $2.00/$0.20/$12.00 per 1M uncached-input/cached-input/output
tokens) and `gpt-transcribe` (transcription — $0.0045/minute).

**⚠️ Known gap, please resolve before relying on trial transcription**:
`OPENAI_TRANSCRIPTION_MODEL` defaults to `whisper-1` (see `.env.local`),
but the only transcription pricing configured is for `gpt-transcribe` — a
different model. No invented price was added for `whisper-1` (only
verified numbers go in the pricing config). Until you either (a) add a
verified `whisper-1` price to `provider-pricing.ts`, or (b) switch
`OPENAI_TRANSCRIPTION_MODEL` to `gpt-transcribe`, **trial accounts cannot
transcribe audio at all** — every attempt fails closed (see "Unknown model
safety" below) rather than silently transcribing for free. Development/pro
accounts are unaffected (they have no cost cap to protect, so an unpriced
model there just logs a warning and proceeds).

**Unknown model safety**: a cost calculation for a model with no pricing
entry throws (`UnknownModelPricingError`) rather than silently returning
$0. For a plan with no cost cap (development, pro), that's caught, logged,
and the action proceeds anyway (nothing to protect). For a cost-capped plan
(trial), it's NOT caught — the action is blocked and the error is logged
server-side, since allowing an unpriced model through would silently
defeat the entire budget.

**Pre-call reservation, not just post-call accounting**: every OpenAI call
made by a cost-capped plan reserves a conservative worst-case cost estimate
*before* the request goes out (text: prompt length ÷ 4 for input tokens +
a per-feature max-output-tokens ceiling from `FEATURE_COST_GUARDS`, which
is also passed as the real `max_completion_tokens` on the live request, so
it's a true upper bound, not a hope; transcription: file size ÷ a
conservative 32kbps floor). `reserve_provider_budget()` (Postgres, in
`0009_provider_cost_budget.sql`) atomically checks that reservation against
already-committed cost — completed spend plus any other still-open
reservation — under a per-user advisory lock, so two simultaneous requests
can't both slip under the same remaining budget. After the real request
succeeds, the reservation is reconciled to the provider's *actual* reported
cost (never the estimate); on failure, it's released with nothing charged.

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
you explicitly run this — signing up normally never assigns `trial`.

Verify with `supabase/tests/provider_cost_rls_verification.sql`: no one
(not even the owning user) can read `provider_cost_reservations` directly,
`reserve_provider_budget()` blocks once exhausted, a different user can't
reconcile/release someone else's reservation, `get_provider_cost_total()`
only ever sums the caller's own cost, and `plan_id` still can't be changed
by the client.

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
