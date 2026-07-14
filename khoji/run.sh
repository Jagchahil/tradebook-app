#!/bin/bash
# Wrapper launchd calls. Loads the local .env, fixes PATH so node is found under a
# minimal launchd environment, and runs the nightly brain: watch, then diff.
#
# TWO JOBS, IN THIS ORDER, AND THE SECOND ONE IS THE POINT.
#
#   watch.mjs   reads GOV.UK, files what is NEW. A change detector. Useful, not the moat.
#   diff.mjs    reads GOV.UK and reads OUR TAX ENGINE, and shouts when they disagree.
#
# watch alone could never have caught the bug we actually had. It watched the mileage page every
# night for months while our engine said 45p and the page said 55p, because it was only ever
# comparing GOV.UK to GOV.UK yesterday. Nothing performed the subtraction. diff.mjs is the
# subtraction. If you are ever tempted to drop it to "speed up the run", read docs/105 first.
#
# The differ runs even if the watcher fails, because the two answer different questions and
# "we could not fetch the news" is no reason to stop asking "are our numbers still right".
cd "$(dirname "$0")" || exit 1
mkdir -p logs

# Load secrets from .env (never commit the real .env).
set -a
[ -f .env ] && . ./.env
set +a

# launchd starts with a bare PATH. Cover the common node install locations.
export PATH="/Users/jagchahil/lekhio-khoji/.node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"
# If node lives under nvm with a versioned dir, source nvm so `node` resolves.
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

echo "=== khoji run $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> logs/khoji.log

node watch.mjs "$@" >> logs/khoji.log 2>&1
watch_rc=$?

node diff.mjs "$@" >> logs/khoji.log 2>&1
diff_rc=$?

# corpus.mjs is diff.mjs for PROSE. Our claim rules ("no, you cannot claim everyday clothes") rest
# on exact sentences in HMRC's manuals, and HMRC rewrites those manuals constantly. This checks the
# sentence is still there, word for word. The day it is not, a rule we tell a man to put on his tax
# return has lost its authority, and nothing else in the world would tell us.
node corpus.mjs "$@" >> logs/khoji.log 2>&1
corpus_rc=$?

# amend.mjs is the fourth question, and it is the only one that can catch a page being rewritten
# UNDER a number that did not move.
#
# diff.mjs asks "is the NUMBER on the page still the number in our engine". corpus.mjs asks "is the
# SENTENCE still there, word for word". Both are necessary and neither can see this: HMRC moves an
# effective date, adds a band, or rewrites the footnote our extractor leans on, and every number and
# every sentence we check still passes. All green, and we are working off a document that no longer
# exists.
#
# Budget 2025's OOTLAR was silently amended FIVE TIMES IN NINE DAYS. "Figures in paragraph 1.7 have
# been amended." No announcement, no new URL. BEING LATE IS RECOVERABLE. BEING CONFIDENTLY WRONG FOR
# A FORTNIGHT IS NOT.
#
# It runs LAST because it is the cheapest and the least urgent of the four: it prompts a human to go
# and LOOK at a page, it does not assert that anything is wrong. And it runs even if the others fail,
# for the same reason they all do: "we could not fetch the news" is no reason to stop asking whether
# the ground has moved.
node amend.mjs "$@" >> logs/khoji.log 2>&1
amend_rc=$?

# Report the worst thing that happened, so launchd's exit code means something. A 2 from the differ
# or the corpus means the ground has moved under us, which is an incident, not a crash: /api/health
# has already gone red off the row it wrote. A 1 from any of them means the job itself is broken.
echo "[khoji] watch rc=$watch_rc diff rc=$diff_rc corpus rc=$corpus_rc amend rc=$amend_rc" >> logs/khoji.log
if [ "$watch_rc" -ne 0 ]; then exit "$watch_rc"; fi
if [ "$diff_rc" -ne 0 ]; then exit "$diff_rc"; fi
if [ "$corpus_rc" -ne 0 ]; then exit "$corpus_rc"; fi
exit "$amend_rc"
