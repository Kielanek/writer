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
(`0001_init.sql` through `0006_auth_and_rls.sql`). `0006_auth_and_rls.sql` is
the Auth migration — it adds `user_id` ownership columns, indexes, and Row
Level Security policies to every user-owned table, and updates
`create_document_version` to enforce and stamp ownership.

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

## Checks

```bash
npm run lint       # ESLint
npx tsc --noEmit   # Type checking
npm run test       # Vitest — critical business logic (context isolation,
                    # version numbering, restore semantics, metadata
                    # fallback, cascading deletes)
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
