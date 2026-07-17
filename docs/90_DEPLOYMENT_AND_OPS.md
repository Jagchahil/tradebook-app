# Lekhio: Deployment & Ops Playbook

> Written 3 Jul 2026 after a long day of "works on laptop, breaks on phone" issues.
> The point of this doc: never have those again. Read it before any deploy.

---

## 1. The golden rule that would have saved the whole day

**Claude (and any tool) cannot see your phone screen.** The browser window it drives
won't resize to phone width, and the site can't be loaded in a test frame (our own
security headers block it). So anything "mobile" is verified from the *code*, not the
*pixels*.

**Therefore:** after every deploy, YOU test on your real phone. If something looks wrong,
**send one screenshot** of the broken screen. That single screenshot fixes an issue in one
shot; guessing without it caused every long back-and-forth.

---

## 2. Where the code lives (this is the part that caused the repo mix-ups)

There are **two copies** of each project. Edits happen in the Cowork copy; deploys happen
from a separate repo. They are NOT the same folder.

| Purpose | Web | Mobile |
|---|---|---|
| **Cowork edit copy** (where changes are made) | `~/Documents/Claude/Projects/Tradesman/tradebook-web` | `~/Documents/Claude/Projects/Tradesman/tradebook-app` |
| **Deploy repo** (where you push from) | `~/Projects/tradesman/tradebook` | `~/Projects/tradesman/tradebook-app` |
| **Git remote** | `github.com/Jagchahil/tradebook-app` | `github.com/Jagchahil/tradebook-mobile` |
| **Hosting** | Vercel `tradebook1/tradebook-app` -> `tradebook-app-five.vercel.app` | Expo Go on your phone (not a server) |

### The trap (this bit is genuinely confusing, read twice)
- The **web** deploy folder is named `tradebook` but its git remote is named **tradebook-app**.
- The **mobile** deploy folder is named `tradebook-app` but its git remote is named **tradebook-mobile**.

So the folder called `tradebook-app` on disk is the MOBILE one. Earlier today the mobile
app files got pushed into the website repo because the terminal was in the wrong folder.
**Always `cd` to the correct deploy folder first and check the folder name in your prompt.**

---

## 3. How to deploy the WEBSITE

From a terminal, run this as a block (copy changed files across, then push + force a build):

```bash
cd ~/Projects/tradesman/tradebook          # <-- the WEBSITE repo (folder named "tradebook")
COWORK="$HOME/Documents/Claude/Projects/Tradesman/tradebook-web"

# copy only the files that changed, e.g.:
cp "$COWORK/app/_shared/site.tsx" app/_shared/site.tsx
cp "$COWORK/app/page.tsx" app/page.tsx
# ...one cp line per changed file...

git add -A && git commit -m "describe the change"
git push
npx vercel --prod                          # forces the production build; prints the URL
```

- `npx vercel --prod` is what makes it go live reliably. Don't trust the git auto-deploy alone.
- Wait for `Ready in ~1m` and the `Aliased  https://tradebook-app-five.vercel.app` line.
- Sanity check: the commit summary should say a **small** number of files changed. If it
  says dozens of new files, STOP, you're in the wrong folder (see the trap above).

## 4. How to run / deploy the MOBILE app

The mobile app runs on your PHONE via Expo Go. It is not deployed to a server.

```bash
COWORK="$HOME/Documents/Claude/Projects/Tradesman"
APP="$HOME/Projects/tradesman/tradebook-app"   # <-- the MOBILE repo (folder named "tradebook-app")
rsync -a "$COWORK/tradebook-app/app/" "$APP/app/"
cd "$APP"
npx tsc --noEmit                               # typecheck; catch errors before running
npx expo start --clear                         # then SCAN THE QR CODE with Expo Go on your phone
git add -A && git commit -m "describe the change"
git push                                        # -> github Jagchahil/tradebook-mobile
```

- The app opens on your PHONE (scan QR), **not** in a browser. `npm run web` is the wrong command.
- Note: 55p/mile mileage is CORRECT for 2026/27 (HMRC raised 45p to 55p). Do not "fix" it.

---

## 5. The phone cache gotcha (this caused several false alarms)

Phones cache the site hard. After a deploy, a normal refresh often shows the OLD version.
To force the newest version on your phone, do ANY of:

- Add a throwaway query to the URL: **`tradebook-app-five.vercel.app/?fresh=1`** (change the
  number each time). A new query string always bypasses the cache. Easiest option.
- Open the site in a **private / incognito** tab.
- Clear the site's cache in your phone browser settings.

If the site looks stale/broken but the Vercel deploy said "Ready", it's almost always cache.
Try `?fresh=N` before assuming the code is wrong.

---

## 6. Light / Dark theme (current state and how to change it)

**Right now the site is LIGHT-ONLY.** This is deliberate and stable. It is set in
`tradebook-web/app/_shared/site.tsx` inside `REVEAL_JS`:

```js
document.documentElement.setAttribute('data-theme', 'light');
```
and the theme toggle is hidden with `.theme-toggle{display:none !important}`.

### Why light-only for now
The marketing pages and (now) the free-tool pages are all theme-aware, so the site *can* do
dark. But dark kept surfacing mobile-only glitches that couldn't be verified without a phone.
Light-only removes any chance of a light/dark mismatch. Plenty of production sites ship light-only.

### To re-enable auto dark/light (follow the phone's setting, no button)
Replace the line above with:
```js
var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme:dark)') : null;
document.documentElement.setAttribute('data-theme', (mq && mq.matches) ? 'dark' : 'light');
if(mq && mq.addEventListener){ mq.addEventListener('change', function(e){ document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light'); }); }
```
Then **test on a real phone in dark mode and send a screenshot** before trusting it. All the
colour variables (light + dark) already exist in `site.tsx` (`:root` and `[data-theme="dark"]`).
Note: the invoice preview (`.paper` in `invoice-generator/Generator.tsx`) is intentionally kept
white in any theme so it prints as a proper document.

---

## 7. Pre-deploy checklist (30 seconds, saves hours)

1. Did I copy the changed file(s) from the Cowork copy into the correct deploy repo?
2. Am I in the right folder? (`tradebook` = website, `tradebook-app` = mobile)
3. Did the commit show a small, expected number of changed files?
4. Did `npx vercel --prod` finish with "Ready" and the correct alias?
5. On my **phone**: open with `?fresh=N`, check the pages I changed, in both orientations.
6. If anything looks off on the phone: screenshot it, don't guess.

---

## 8. Known gotchas seen this session (so they don't repeat)

- **Repo mix-up:** mobile files pushed to the website repo because the terminal was in the
  wrong folder. Reverted with `git revert`. Always check the folder.
- **Vercel silent deploy block:** a cron in `vercel.json` incompatible with the Hobby plan can
  silently stop deploys (git pushes succeed, production never updates, no error shown). If
  "pushed but not live", run `npx vercel --prod` to see the real error. Hobby crons must run
  at most once/day.
- **Unused variables after edits:** removing a nav or element can orphan a `const`/import. A
  strict build can fail on these. After deleting UI, check for now-unused vars.
- **Interactive JS ("tabs/toggles"):** prefer ONE delegated listener on `document`
  (`e.target.closest(...)`) over attaching a listener to each button. Per-button listeners can
  silently fail to attach depending on load timing. (This was the compare-filter bug.)
- **Reveal animations:** content must be visible by DEFAULT (`.reveal{opacity:1}`). Never rely
  on JS to reveal content, or a hydration hiccup makes the page look blank.

---

## 9. Quick reference

- Live site: https://tradebook-app-five.vercel.app
- Website repo: `~/Projects/tradesman/tradebook` (remote: Jagchahil/tradebook-app)
- Mobile repo: `~/Projects/tradesman/tradebook-app` (remote: Jagchahil/tradebook-mobile)
- Cowork edits: `~/Documents/Claude/Projects/Tradesman/{tradebook-web,tradebook-app}`
- Force-fresh on phone: add `?fresh=N` to any URL.
