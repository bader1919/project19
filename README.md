# RefVault

**Your personal library for things you learn from YouTube.** Paste a video link and RefVault keeps:

- the **transcript** (English and Arabic), clickable to jump to that moment in the video
- **every link** from the description and captions, kept separately with a label, the text around it and its timestamp (short links like bit.ly are expanded to the real page)
- **chapters** from the description
- an **AI summary, key points and topics**, written by Claude through the RefVault connector
- **useful details from the description** (tools, resources, discount codes) and **things mentioned out loud without a link** (books, tools, people)
- **your own notes** (autosaved)

Then you can **search everything by topic**: titles, summaries, transcripts, links and notes, in English or Arabic. Arabic search ignores diacritics and hamza and alef variants, so ادوات finds أدوات.

The left side menu is built around modules. Videos is the first one, and **Wikis** and **Courses** already have places reserved, so they can be added later without changing the database design.

---

## How the AI part works (MCP, no AI key needed in the app)

RefVault runs its own **MCP server**. You add it to Claude once as a *custom connector*. After that you just chat:

> Save this video to RefVault: https://youtu.be/…

Claude calls `add_video`, which fetches the transcript and links. Claude then reads the transcript and calls `save_analysis` with the summary, topics, link labels and mentions. You can also ask:

> Which video mentioned a vector database? Give me the link.
> Find the link to that course discount someone shared

| MCP tool | What it does |
|---|---|
| `add_video` | Save a video (metadata, description, transcript, links, chapters) |
| `get_transcript` | Read long transcripts page by page, with `[seconds]` markers |
| `save_analysis` | Store the summary, key points, topics, description info, mentions and link labels |
| `search_library` | Full-text search with topic, type and status filters |
| `get_item` | Everything about one item |
| `list_links` | Search all saved links by text or domain |
| `list_topics` / `list_pending` | Existing topics; items waiting for analysis |
| `add_note`, `add_link`, `tag_item`, `add_to_collection`, `retry_transcript` | Edits |

## Everything is automatic

After you save a video (from the app, your phone's share menu, or Claude), nothing else is needed:

1. **Transcript.** Tried in this order:
   - **YouTube captions, read by the server.** Free, but YouTube usually blocks cloud servers.
   - **Your PC helper** (Settings → PC helper). A small background program on your own computer, whose home
     connection YouTube does not block. It fetches the real captions with
     [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) and the video description,
     and sends them to your library within ~20 seconds. Installed with one copied command, no admin rights,
     and it starts with your computer.
   - **Google Gemini** watches the video itself, so it also covers videos with no captions. It runs in the
     background when the PC helper is off or had nothing (after 3 minutes), in 10-minute parts for long
     videos (free tier: up to 8 hours of video a day).
   - Optional backups: [Supadata](https://supadata.ai) and [youtube-transcript.io](https://www.youtube-transcript.io) keys,
     or paste the transcript yourself.
2. **Analysis.** Gemini writes the summary, key points, topics, link labels and spoken mentions. If Claude
   analyses the video through the connector, Claude's version is kept.

A worker runs every minute (`pg_cron` → Edge Function `/worker`, migration `004_auto_pipeline.sql`) and
retries failures with back-off. It needs two rows in `private.app_secrets`: `worker_url`
(`https://<project>.supabase.co/functions/v1/refvault/worker`) and `worker_secret` (any long random string).

---

## Setup (one time, about 15 minutes)

### 1. Supabase (database and login)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and click **Run**.
3. Go to **Authentication → URL Configuration** and set **Site URL** to your Netlify address (step 2), for example `https://my-refvault.netlify.app`.
4. Go to **Project Settings → API** and copy the **Project URL**, the **anon public** key and the **service_role** key.

### 2. Netlify (hosting)

1. In Netlify, choose **Add new site → Import an existing project** and pick this repository. The build settings come from `netlify.toml`.
2. Go to **Site configuration → Environment variables** and add:

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (secret, server only) |

3. Deploy, open the site and sign in with your email (you'll get a magic link).

> **Lock it to you:** after your first sign-in, turn off **Allow new users to sign up** in Supabase (**Authentication → Sign In / Providers**). For extra safety also add the Netlify variable `ALLOWED_EMAILS` = your email (comma-separate several); the server then refuses every other account.

### 3. Connect Claude

1. In RefVault, open **Settings → Claude connector** and click **Generate connector URL**, then copy it. It's shown only once, so treat it like a password.
2. In Claude, open **Settings → Connectors → Add custom connector**. Name it *RefVault*, paste the URL and save.
3. Try it: *"Save this video to RefVault: https://youtu.be/…"*

If the URL ever leaks, use **Revoke all** in Settings and generate a new one.

### On your phone

Open the site and use **Add to Home Screen**. RefVault then appears in the YouTube app's **Share** menu, and sharing a video opens the save dialog.

---

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev                  # app + Netlify functions on http://localhost:5173
npm test                     # unit tests
npm run typecheck
```

`npm run dev` runs the Netlify functions inside Vite (`scripts/vite-functions.ts`), so you don't need the Netlify CLI.

### End-to-end test stack (no Supabase account needed)

`bash tests/e2e/run-stack.sh` starts a local copy of everything: PostgreSQL, PostgREST, a small fake Supabase gateway, and the app with recorded YouTube responses (`tests/e2e/fake-youtube.mjs`). It needs PostgreSQL 16 and a PostgREST binary in `/var/tmp/pgrst`.

### Project layout

```
src/                 React app (side-menu layout, pages, data access with Supabase RLS)
src/modules/         Content-module registry (videos now; wikis and courses later)
server/              Shared server code: YouTube fetching, transcripts, links, library ops, MCP server
netlify/functions/   HTTP endpoints: /api/ingest, /api/token, /mcp/:token
shared/              Code used by both browser and server
supabase/migrations/ Database schema, row-level security, search functions
tests/               Unit tests (Vitest), SQL smoke test, e2e harness
```

### Adding a new module later (for example Wikis)

1. Add a details table such as `wiki_pages (item_id …)`, like `video_details`, and include it in `build_search_doc`.
2. Build its pages under `src/modules/wikis/`, and set `enabled: true` in `src/modules/registry.ts`.
3. Add MCP tools for it in `server/mcp.ts`.
