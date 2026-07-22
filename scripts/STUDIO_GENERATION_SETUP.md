# The generation agent, Path A setup

This is the half that turns an approved storyboard into an actual video, using Higgsfield. It runs as
a scheduled Claude session on the Mac mini that already has the Higgsfield connector. It only ever
generates what you have approved, and it never posts or spends.

## Where this sits in the loop

1. Drafting agent (07:00, `scripts/studio-agent.mjs`) drafts storyboards into Awaiting approval.
2. You review in the Studio and approve the ones you want. Approving moves them to Scheduled.
3. Generation agent (this, 09:00, `scripts/studio-generate.sh`) reads the approved ones, generates the
   videos through Higgsfield, and attaches each finished file to its asset.
4. You post the finished files and mark them Live. (Auto posting is Phase B, gated on platform app
   reviews.)

So the two gates stay yours: approve the storyboard, and post the video.

## What the Mac mini needs

- **Claude installed and signed in** on the Mac mini (the `claude` CLI), separate from your personal
  bot's setup so the two never collide.
- **The Higgsfield MCP configured for that Claude**, so a headless session can call `generate_video`
  and `generate_image`. Confirm with a quick interactive `claude` session that the connector is there.
- **The repo present** with `.env.local` holding the same two values the drafting agent uses:

  ```
  AGENT_SECRET=the-same-value-you-set-on-vercel
  NEXT_PUBLIC_APP_URL=https://lekhio.app
  ```

- **The master switch and the caps on Vercel.** Generation stays dark until you set, in the Vercel
  project env:

  ```
  STUDIO_GEN_ENABLED=true
  ```

  While that is unset or not the literal `true`, the queue hands the worker nothing, so nothing is
  generated and nothing is spent. Two optional caps ride on top, with safe defaults if unset:

  ```
  STUDIO_GEN_MAX_PER_BRIEF=8    most renders one queue pass hands out
  STUDIO_GEN_MAX_PER_DAY=24     most renders in a UTC day, across every pass
  ```

  These are the standing spend ceiling. The worker cannot exceed them however often it wakes.

## Run it by hand first

Make the wrapper executable, then run one pass:

```
chmod +x scripts/studio-generate.sh
./scripts/studio-generate.sh
```

The session will fetch the approved queue, generate each piece through Higgsfield, and POST the media
URL back. Watch the Studio: the approved cards get a file attached. If the queue is empty (nothing
approved yet), it stops and says so.

You will likely need to tune the `claude` flags in `studio-generate.sh` for your install, so the
headless session is allowed to use the Higgsfield MCP tools and Bash (for the two curl calls). Run it
interactively once to grant the tools, then the scheduled run inherits that.

## Install the daily job

1. Edit `scripts/com.lekhio.studiogenerate.plist`, set the absolute path to `studio-generate.sh`.
2. Install and load:

   ```
   cp scripts/com.lekhio.studiogenerate.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.lekhio.studiogenerate.plist
   ```

3. It runs at 09:00, after your morning approvals. Trigger a run any time with:

   ```
   launchctl start com.lekhio.studiogenerate
   cat /tmp/lekhio-studiogenerate.log
   ```

To stop it: `launchctl unload ~/Library/LaunchAgents/com.lekhio.studiogenerate.plist`.

## Honest notes

- **It generates only approved assets.** The queue endpoint returns nothing that has not passed your
  storyboard gate, so the agent physically cannot spend Higgsfield credits on something you rejected.
- **The stored file is the Higgsfield hosted URL.** That is fine to review and post now. If those URLs
  ever expire, the next build is to download and re-host each file in Supabase storage so the link is
  permanent. Not needed to start.
- **Posting is still manual.** Attaching a video does not put it in front of a customer. That is Phase
  B, once the platform app reviews clear and the publishing hub is live.
- **Timing.** The 09:00 run only catches what you approved before 09:00. Approve later, or trigger a
  run by hand, or set the job to run a few times a day. Whatever fits how you review.
