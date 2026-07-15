# The Content Studio agent, Phase A setup

The daily loop, connector free. Each morning the Mac mini triggers the deployed app, which drafts a
few storyboards from the idea backlog with Claude and drops them into Awaiting approval. You review
and approve. Nothing posts or spends. This is docs 110, 111, 112 turned on.

## What runs where

- **The work runs on the deployed app** (Vercel), at `POST /api/agent/studio-run`. It holds the keys,
  calls Claude, writes to Supabase, and writes a heartbeat row every run.
- **The Mac mini only triggers it**, once a day, with `scripts/studio-agent.mjs`. It holds nothing but
  the shared secret and the app URL. This keeps it isolated from your personal bot.

## Server environment (set on Vercel)

- `AGENT_SECRET` a long random string. This is the whole gate on the agent endpoint. If it is not
  set, the endpoint refuses everyone, which is the safe direction.
- `STUDIO_ALERT_PHONE` optional. Your number in full international form, e.g. 447700900123. When set
  and WhatsApp is configured, the run sends you a one line ping that drafts are ready. Best effort:
  the drafts land whether or not the ping sends.
- The app already has `ANTHROPIC_API_KEY`, the Supabase keys, and the WhatsApp keys.

Generate a secret:

```
openssl rand -hex 32
```

Put the same value in Vercel as `AGENT_SECRET`, and in the Mac mini's `.env.local`.

## Mac mini environment (`.env.local` in the repo root)

```
AGENT_SECRET=the-same-value-you-set-on-vercel
NEXT_PUBLIC_APP_URL=https://lekhio.app
```

## Test it by hand first

```
node scripts/studio-agent.mjs --count 2
```

You should see a line like `studio-agent: {"drafted":2,"considered":5,"titles":[...]}`. Open the
console, tap Studio, and the two new storyboards are in Awaiting approval. If it says `drafted:0`,
the backlog is empty or every idea is already drafted. Add ideas in the Studio and run again.

## Install the daily job

1. Edit `scripts/com.lekhio.studioagent.plist`. Set the two absolute paths: your `node` (find it with
   `which node`) and the full path to `scripts/studio-agent.mjs`.
2. Copy it in and load it:

```
cp scripts/com.lekhio.studioagent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.lekhio.studioagent.plist
```

3. Force one run to confirm:

```
launchctl start com.lekhio.studioagent
cat /tmp/lekhio-studioagent.log
```

It runs every day at 07:00. To stop it: `launchctl unload ~/Library/LaunchAgents/com.lekhio.studioagent.plist`.

## The heartbeat

Every run writes a row to `studio_agent_runs`, success or failure, drafted something or nothing. That
is how a bot that quietly dies becomes visible instead of looking like a slow week. A console light on
top of this row is a small follow up.

## What Phase A does NOT do yet, and why

- **It does not generate the actual video or carousel.** It drafts the storyboard, which is the thing
  you approve before any generation credit is spent. Turning an approved storyboard into a finished
  file goes through the generation connector, which is the next build.
- **It does not post.** Posting through the platforms needs their app reviews (Meta, TikTok, YouTube,
  LinkedIn), which are the long pole. Until then you post the finished files by hand. That is Phase B.
- **The WhatsApp ping needs billing on the WhatsApp account** and, if you are outside the 24 hour
  window, an approved template. If the ping does not arrive, the drafts are still waiting in the
  Studio. The ping is a convenience, not the loop.

## The gates never move

The agent prepares. You approve what goes out, and you approve what spends. That is the product.
