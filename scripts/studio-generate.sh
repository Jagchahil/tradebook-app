#!/usr/bin/env bash
#
# The Mac mini GENERATION agent runner (Path A). Loads the repo env, then runs one headless Claude
# session that generates approved storyboards through the Higgsfield connector and writes the videos
# back to the Studio. Isolated from the personal bot: its own launchd label and its own log.
#
# The Higgsfield MCP must be configured for this Claude install, and Claude must be allowed to use it
# plus Bash (for the two curl calls). See STUDIO_GENERATION_SETUP.md.
#
# This runner never approves, posts, or spends. It only generates what a human already approved.

set -euo pipefail
cd "$(dirname "$0")/.."

# Load env from the repo, without overwriting anything already exported.
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi

# Accept either name for the app URL.
: "${APP_URL:=${NEXT_PUBLIC_APP_URL:-}}"
export APP_URL AGENT_SECRET

if [ -z "${APP_URL:-}" ] || [ -z "${AGENT_SECRET:-}" ]; then
  echo "[studio-generate] missing APP_URL or AGENT_SECRET. Nothing run." >&2
  exit 2
fi

# One headless pass. Tune the flags to your Claude install (see the setup doc): the session needs the
# Higgsfield MCP tools and Bash allowed so it can generate and call the two agent endpoints.
exec claude -p "$(cat scripts/studio-generate-agent.md)"
