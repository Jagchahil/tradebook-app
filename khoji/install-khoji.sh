#!/bin/bash
# Khoji installer. Run on the Mac mini with:
#   bash ~/Downloads/install-khoji.sh
# It is safe to run more than once. It only touches its own folder and its own
# launchd job (com.lekhio.khoji). It never touches the personal bot.
set -e

# Make sure node is findable in a plain shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi

# Locate the AirDropped folder (Downloads first, or already moved).
SRC=""
[ -d "$HOME/Downloads/khoji" ] && SRC="$HOME/Downloads/khoji"
[ -d "$HOME/lekhio-khoji" ] && SRC="$HOME/lekhio-khoji"
if [ -z "$SRC" ]; then echo "Could not find the khoji folder in ~/Downloads. Stopping."; exit 1; fi

DIR="$HOME/lekhio-khoji"
[ "$SRC" != "$DIR" ] && mv "$SRC" "$DIR"
cd "$DIR"

echo "== node version =="
node -v

echo "== installing the one dependency (pg) =="
[ -f package.json ] || npm init -y >/dev/null 2>&1
npm i pg

echo "== finding your Obsidian vault =="
VAULT="$(find "$HOME" -maxdepth 6 -type d -name .obsidian 2>/dev/null | head -1 | sed 's|/.obsidian$||')"
echo "vault: ${VAULT:-<none found: Obsidian notes will be skipped, Supabase still gets written>}"

echo "== writing .env =="
# THE PASSWORD IS NOT IN THIS SCRIPT, AND IT USED TO BE.
#
# The khoji_writer connection string was hardcoded on the next line, in a shell script that lives
# in a folder that gets synced, backed up, mirrored and read by tools. A credential in a script is
# a credential in every copy of that script, forever, and one `git add .` away from being public.
# It was never committed, which was luck rather than design. So: pass it in, or be asked for it.
#
#   KHOJI_DB_URL='postgres://khoji_writer:...@...:5432/postgres' bash khoji-setup.sh
#
# An existing .env is never overwritten, so re-running this cannot wipe a working install. That
# also matters: on 8 July a hand-edit of .env put a stray letter on the front of the DB key, the
# watcher silently wrote nothing for four days, and exited 0 every time. Touch this file rarely.
if [ -f .env ]; then
  echo "  .env already exists. Leaving it alone."
else
  if [ -z "$KHOJI_DB_URL" ]; then
    printf "  Paste the khoji_writer connection string (hidden): "
    read -rs KHOJI_DB_URL
    printf "\n"
  fi
  if [ -z "$KHOJI_DB_URL" ]; then echo "  No KHOJI_DB_URL given. Stopping."; exit 1; fi
  umask 077
  cat > .env <<EOF
KHOJI_DB_URL=${KHOJI_DB_URL}
OBSIDIAN_VAULT=${VAULT}
KHOJI_DISTILL=off
ANTHROPIC_API_KEY=
KHOJI_MAX_ITEMS=25
EOF
  chmod 600 .env
  echo "  written, mode 0600."
fi

echo "== dry run (fetch and parse only, writes nothing) =="
node watch.mjs --dry-run

echo "== installing the daily 05:15 schedule =="
sed -i '' "s|REPLACE_WITH_ABSOLUTE_PATH|$DIR|g" com.lekhio.khoji.plist
chmod +x run.sh
mkdir -p logs
cp com.lekhio.khoji.plist "$HOME/Library/LaunchAgents/"
launchctl unload "$HOME/Library/LaunchAgents/com.lekhio.khoji.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.lekhio.khoji.plist"

echo "== running one real walk now (writes to Supabase and Obsidian) =="
launchctl start com.lekhio.khoji
sleep 10

echo "== log =="
tail -25 logs/khoji.log 2>/dev/null || echo "(no log yet)"
echo ""
echo "======================================================"
echo "DONE. Copy the output above and paste it back to Claude."
echo "======================================================"
