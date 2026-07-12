# Khoji, the Lekhio knowledge watcher (Mac mini, Phase D)

Khoji watches GOV.UK and HMRC for tax changes, distils each into a clean sourced
summary, and stores it in Supabase (for the app and the agent to read) and in
Obsidian (for you to review). It is the "overnight it learns" engine from doc 82.

Built dormant: it collects and stores updates now with zero cost. The AI
distillation switches on the day Anthropic credit is funded, and the next nightly
run works through everything it captured while it waited.

## Isolation (important)

Khoji is deliberately separate from the personal bot already on this mini. It
lives in its own directory, runs under its own launchd label `com.lekhio.khoji`,
writes its own logs, and connects to the database as `khoji_writer`, a role that
can only touch the one `knowledge_items` table and nothing else. Before installing,
check nothing else already uses that label: `launchctl list | grep lekhio`.

## Build brief for Claude Code on the mini

Paste this whole file's intent to Claude Code on the mini, or just follow the steps.

1. Put this `khoji/` folder somewhere permanent, for example `~/lekhio-khoji/`.
   Note its absolute path.
2. In the Supabase SQL editor (project tradebook-prod), open `schema.sql`, replace
   `REPLACE_WITH_A_STRONG_PASSWORD` with a strong password, and run it. This makes
   the `knowledge_items` table and the restricted `khoji_writer` role.
3. `cp .env.example .env` and fill it in:
   - `KHOJI_DB_URL`: the Supabase database connection string, with the user and
     password swapped to `khoji_writer` and the password from step 2. Keep SSL.
   - `OBSIDIAN_VAULT`: absolute path to the vault (Khoji writes a `Khoji/` folder
     inside it).
   - Leave `KHOJI_DISTILL=off` and `ANTHROPIC_API_KEY` blank for now (dormant).
4. Install the one dependency: `npm init -y >/dev/null 2>&1; npm i pg`.
5. Verify with a dry run (no writes, just fetch and parse):
   `node watch.mjs --dry-run`. You should see it fetch each source and list what
   it would store. If a source 404s, GOV.UK moved the path; edit `sources.json`.
6. Do a real run once: `node watch.mjs`. Check a few rows landed
   (`select count(*), status from public.knowledge_items group by status;`) and
   that markdown notes appeared in the Obsidian `Khoji/` folder.
7. Schedule it. Edit `com.lekhio.khoji.plist`, replace the three
   `REPLACE_WITH_ABSOLUTE_PATH` with the folder's absolute path, then:
   ```
   chmod +x run.sh
   cp com.lekhio.khoji.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.lekhio.khoji.plist
   launchctl start com.lekhio.khoji     # run once now to confirm
   tail -f logs/khoji.log
   ```

## Turning distillation on (later, when credit is funded)

Set `KHOJI_DISTILL=on` and `ANTHROPIC_API_KEY=...` in `.env`. Nothing else changes.
The next run distils new items and works back through the `needs_distillation`
backlog. Watch the first run's cost, and set a hard monthly spend cap on the
Anthropic account first.

## What to do with an `engine_impact` flag

When Khoji marks an item `engine_impact: true`, it thinks a rate, threshold or
rule changed. That is your signal to update `lib/taxengine.ts` (or the relevant
engine), extend the exam suite, and re verify against the GOV.UK source before
anything ships. Khoji never edits the engine itself. It only tells you to look.

## Files

- `watch.mjs`     the watcher (collect, dedupe, store, note, backlog)
- `distill.mjs`   the Anthropic distillation (dormant until credit)
- `sources.json`  the feeds and pages it watches (edit freely)
- `schema.sql`    the table and the restricted writer role (run once in Supabase)
- `run.sh`        the launchd wrapper (loads .env, fixes PATH)
- `com.lekhio.khoji.plist`  the daily 05:15 schedule
- `.env.example`  copy to `.env` and fill in
