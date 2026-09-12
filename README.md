# Voice Workspace

A voice-first AI content workspace. Create Projects, capture voice/audio/text
notes, and turn accumulated project knowledge into YouTube scripts, LinkedIn
posts, newsletters, articles, and summaries — with AI-assisted editing,
version history, and a project-scoped "Ask Project" chat.

This is a local/single-user MVP: no authentication, no payments, no RAG.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase
(PostgreSQL) + OpenAI SDK.

## Setup

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then open the SQL
Editor and run the contents of `supabase/migrations/0001_init.sql`. This
creates all tables, indexes, and the `create_document_version` function used
for safe, linear version numbering.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=        # Project Settings -> API -> Project URL
SUPABASE_SERVICE_ROLE_KEY=       # Project Settings -> API -> service_role key (server-only, never exposed to the browser)
OPENAI_API_KEY=                  # platform.openai.com
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_TEXT_MODEL=gpt-5.6-terra
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For voice recording,
open the app on your phone (or use Chrome DevTools device emulation) — the
Record Note button uses the browser's `MediaRecorder` API and requires
microphone permission. Recording over the network (not localhost) requires
HTTPS.

## Checks

```bash
npm run lint       # ESLint
npx tsc --noEmit   # Type checking
npm run test       # Vitest — critical business logic (context isolation,
                    # version numbering, restore semantics, metadata
                    # fallback, cascading deletes)
```

## Architecture notes

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
