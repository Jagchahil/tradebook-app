#!/bin/bash
# Khoji all-in-one setup. No Homebrew, no admin password, nothing system-wide.
# It downloads its own private Node into the Khoji folder and installs everything.
# Run on the mini with:   bash ~/Downloads/khoji-setup.sh
set -e

DIR="$HOME/lekhio-khoji"

# Find the Khoji folder (Downloads if fresh, or already moved to lekhio-khoji).
SRC=""
[ -d "$HOME/Downloads/khoji" ] && SRC="$HOME/Downloads/khoji"
[ -d "$DIR" ] && SRC="$DIR"
if [ -z "$SRC" ]; then echo "Could not find the khoji folder. Stopping."; exit 1; fi
[ "$SRC" != "$DIR" ] && mv "$SRC" "$DIR"
cd "$DIR"

# --- Get a private Node if the machine has none (no admin needed) ------------
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  NODE_DIR=""
else
  echo "== No Node found. Downloading a private copy (about 40 MB) =="
  NODE_VER="v22.11.0"
  case "$(uname -m)" in
    arm64) NPLAT="darwin-arm64" ;;
    *)     NPLAT="darwin-x64" ;;
  esac
  NODE_DIR="$DIR/.node"
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    mkdir -p "$NODE_DIR"
    curl -fsSL "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${NPLAT}.tar.gz" -o /tmp/khoji-node.tar.gz
    tar -xzf /tmp/khoji-node.tar.gz -C "$NODE_DIR" --strip-components=1
    rm -f /tmp/khoji-node.tar.gz
  fi
  export PATH="$NODE_DIR/bin:$PATH"
  NODE_BIN="$NODE_DIR/bin/node"
fi
echo "== node =="
"$NODE_BIN" -v

echo "== installing the one dependency (pg) =="
[ -f package.json ] || npm init -y >/dev/null 2>&1
npm i pg

echo "== finding your Obsidian vault =="
VAULT="$(find "$HOME" -maxdepth 6 -type d -name .obsidian 2>/dev/null | head -1 | sed 's|/.obsidian$||')"
echo "vault: ${VAULT:-<none found: Obsidian notes skipped, Supabase still written>}"

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
"$NODE_BIN" watch.mjs --dry-run

echo "== installing the daily 05:15 schedule =="
# If we used a private Node, make the scheduled runner use it too.
if [ -n "$NODE_DIR" ]; then
  sed -i '' "s#export PATH=\"#export PATH=\"$NODE_DIR/bin:#" run.sh
fi
sed -i '' "s|REPLACE_WITH_ABSOLUTE_PATH|$DIR|g" com.lekhio.khoji.plist
chmod +x run.sh
mkdir -p logs
cp com.lekhio.khoji.plist "$HOME/Library/LaunchAgents/"
launchctl unload "$HOME/Library/LaunchAgents/com.lekhio.khoji.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.lekhio.khoji.plist"

echo "== running one real walk now (writes to Supabase and Obsidian) =="
launchctl start com.lekhio.khoji
sleep 12

echo "== log =="
tail -30 logs/khoji.log 2>/dev/null || echo "(no log yet)"
echo ""
echo "=================================================="
echo "DONE. Copy everything above and paste it to Claude."
echo "=================================================="
