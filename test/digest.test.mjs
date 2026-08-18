// The daily digest, and the one word that files a day's books. See lib/digest.ts.
//
// What these tests protect: the MONEY. Our whole WhatsApp budget is 19 sends per
// user per month (lib/margin.ts). A digest that sends twice in a day, or sends a
// paid message when the budget is gone, or sends when there is nothing to say, does
// not just annoy someone. It takes the margin under 80%.

// ⚠️ STAGED RATHER THAN IMPORTED DIRECTLY, SINCE 18 AUGUST 2026. lib/digest.ts was import free on
// purpose so this line could be a plain import, and B30 traded that away for lib/money.ts: the
// local formatter here printed "£1034.30", with no thousands separator, and keeping the property
// meant keeping the eighteenth money formatter in a codebase that swept out seventeen. Node's type
// stripping cannot resolve an extensionless relative import, so the chain is staged and rewritten,
// the way eight other suites in this directory already do it.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'digest-'));
const fix = (t) => t.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['money', 'digest']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const D = await import(pathToFileURL(path.join(stage, 'digest.ts')).href);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const NOW = new Date('2026-07-11T18:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();

console.log('\nThe daily digest\n');

// --- the message, and THE CUT (doc 104 s3) ------------------------------------
//
// He has already told us Screwfix is materials. So we FILE it and TELL him. We only
// ASK about the shop nobody has heard of. One question, about the one thing that is
// actually a question.
const KNOWN = [
  { id: '1', vendor: 'Screwfix', amount: -84.3, category: 'materials' },
  { id: '2', vendor: 'Shell', amount: -62.15, category: 'fuel' },
  { id: '3', vendor: 'Toolstation', amount: -23.1, category: 'materials' },
];
const NEW = [{ id: '9', vendor: 'Bob Windows', amount: -340, category: 'other' }];

const msg = D.buildDigest({ filed: KNOWN, asking: NEW });

// THE DIGEST NEVER TAKES CREDIT FOR HIS WORK. It used to say "I filed 3 things FOR YOU
// today, because you have told me about them before". `filed` is every confirmed bank
// entry from the last day, which includes the ones HE opened the app and confirmed
// himself. So we claimed his work, and invented a reason for a decision he made.
// 🔴 RUN 2, 13 August 2026: the pinned sentence claimed a CHANNEL we do not have ("from your
// bank": there is no bank feed, she imported a CSV herself) on a DAY the money did not move
// (created_at is the import moment; her rows spanned twelve months). See lib/digest.ts.
ok('says what happened, and counts it', msg.includes('3 things are in your books and counting'));
ok('🔴 AND IT NEVER CLAIMS A BANK FEED THIS PRODUCT HAS NOT BUILT', !/from your bank/i.test(msg));
ok('🔴 NOR THAT MONEY DATED MONTHS AGO ARRIVED TODAY', !/landed .{0,20}today/i.test(msg));
ok('never claims to have done his work for him', !msg.includes('I filed'));
ok('and invents no reason for a decision it did not make', !msg.includes('you have told me about'));
ok('names the shop, the money and the category', msg.includes('Screwfix, £84.30, materials'));
ok('asks ONLY about the one it does not know', msg.includes('One I do not recognise'));
ok('and names it', msg.includes('Bob Windows, £340.00'));
ok('offers to learn it', msg.includes('I will remember'));
ok('an "other" category is never printed as if it meant something', !msg.includes(', other'));

// Nothing new: then we do not ask. We just say what we did.
const noQuestion = D.buildDigest({ filed: KNOWN, asking: [] });
ok('NOTHING to ask means NO question is asked', !noQuestion.includes('do not recognise'));
// 🔴 RUN 2: "Nothing needs you" is scoped to bank sourced rows only, and said "nothing" while
// £380 waited in the pile from another door. It names its own scope now. See R2-F22.
ok('it just says what it did', noQuestion.includes('Nothing here needs you'));
ok('🔴 AND THE ALL CLEAR IS SCOPED TO WHAT IT ACTUALLY LOOKED AT', !/^Nothing needs you/m.test(noQuestion));
ok('and leaves a way to undo', noQuestion.includes('Reply NO'));

// Only new things: no "I filed" claim we did not earn.
const onlyNew = D.buildDigest({ filed: [], asking: NEW });
ok('nothing landed means no claim that anything landed', !onlyNew.includes('in your books and counting'));
ok('one reads as one, not "1 things"', D.buildDigest({ filed: [KNOWN[0]], asking: [] }).includes('One thing is in your books'));

ok('nothing at all means no message at all', D.buildDigest({ filed: [], asking: [] }) === null);

// A long day does not become a wall of text.
const many = Array.from({ length: 14 }, (_, i) => ({ id: String(i), vendor: `Shop ${i}`, amount: -10, category: 'materials' }));
const big = D.buildDigest({ filed: many, asking: [] });
ok('a long list is capped', (big.match(/•/g) || []).length <= 9);
ok('and honest about the rest', big.includes('and 6 more'));

// --- the free window: this is where the money is -------------------------------
ok('he messaged an hour ago: the window is OPEN (free)', D.isWindowOpen(ago(1), NOW) === true);
ok('he messaged 23 hours ago: still open', D.isWindowOpen(ago(23), NOW) === true);
ok('he messaged 25 hours ago: SHUT (a send now costs money)', D.isWindowOpen(ago(25), NOW) === false);
ok('he has never messaged: shut', D.isWindowOpen(null, NOW) === false);
ok('a junk timestamp is treated as shut, not free', D.isWindowOpen('whenever', NOW) === false);

// --- decideDigest: the guard on the budget --------------------------------------
const base = { entryCount: 3, lastInboundAt: null, lastDigestAt: null, budgetLeft: 5, sendsEnabled: true, now: NOW };

ok('nothing new: no message, no cost', D.decideDigest({ ...base, entryCount: 0 }).send === false);
ok('and it says why', D.decideDigest({ ...base, entryCount: 0 }).reason === 'nothing_new');

const free = D.decideDigest({ ...base, lastInboundAt: ago(2) });
ok('inside the window: SEND, and it is FREE', free.send === true && free.free === true);

const freeNoBudget = D.decideDigest({ ...base, lastInboundAt: ago(2), budgetLeft: 0 });
ok('a FREE send goes even with no budget left (it costs nothing)', freeNoBudget.send === true && freeNoBudget.free === true);

const paid = D.decideDigest({ ...base, lastInboundAt: ago(40) });
ok('outside the window: send, but it COSTS', paid.send === true && paid.free === false);

const broke = D.decideDigest({ ...base, lastInboundAt: ago(40), budgetLeft: 0 });
ok('outside the window with no budget: DO NOT SEND', broke.send === false);
ok('the margin is protected, and it says so', broke.reason === 'no_budget');

const twice = D.decideDigest({ ...base, lastDigestAt: '2026-07-11T09:00:00Z' });
ok('never twice in a day, even when free', twice.send === false && twice.reason === 'already_sent_today');

const yesterday = D.decideDigest({ ...base, lastInboundAt: ago(2), lastDigestAt: '2026-07-10T09:00:00Z' });
ok('yesterday does not block today', yesterday.send === true);

const killed = D.decideDigest({ ...base, lastInboundAt: ago(1), sendsEnabled: false });
ok('the kill switch beats everything, including free', killed.send === false && killed.reason === 'sends_disabled');

// --- the one word ---------------------------------------------------------------
//
// It lives in matchAck (lib/waintents.ts) and it is tested in waintents.test.mjs.
//
// There was a second copy here, readReply(), with no callers and a real bug: it read
// "ok", "sure" and a thumbs up as a blanket CONFIRM. Since a confirm files a day's
// books, a man replying "ok" to a digest was approving entries he had not read. It was
// never wired up, so it never bit anyone. It was simply sitting there, correct looking,
// waiting for whoever searched the digest file for how to read a digest reply.
//
// Deleted, along with the tests that were carefully proving it did the wrong thing.

// --- shouldAutoFile: THE MOST DANGEROUS FUNCTION IN THE PRODUCT ----------------
//
// Wrong in one direction: we ask him about Screwfix again and he is mildly annoyed.
// Wrong in the OTHER direction: a child tax credit lands in a man's taxable income
// and he never sees it happen. Those are not the same mistake. It fails towards
// asking.

const AUTO = { source: 'user', knownPersonal: null, looksPersonal: false };

ok('HE taught us this vendor, and nothing looks off: FILE IT', D.shouldAutoFile(AUTO) === true);

// 1. The crowd is not him.
ok('the CROWD taught us: ASK. A stranger vote is not his decision',
  D.shouldAutoFile({ ...AUTO, source: 'crowd' }) === false);
ok('we know nothing: ASK', D.shouldAutoFile({ ...AUTO, source: 'none' }) === false);

// 2. He already said it is not business money.
ok('he already said this is not business: do not file it into his books',
  D.shouldAutoFile({ ...AUTO, knownPersonal: true }) === false);

// 3. THE GUARD THAT MATTERS. Even a vendor he taught us, if it smells like a
//    benefit or a refund or a bet, is NEVER filed silently. This is the exact bug
//    that was in the real books: CHILD TAX CREDIT counted as taxable income.
ok('it LOOKS personal (a benefit, a refund, a bet): NEVER file it silently',
  D.shouldAutoFile({ ...AUTO, looksPersonal: true }) === false);

// And the combination that would be the worst of all: a vendor he "taught" us, that
// is actually a benefit. Still refused.
ok('a taught vendor that looks like a benefit is STILL refused',
  D.shouldAutoFile({ source: 'user', knownPersonal: null, looksPersonal: true }) === false);

// Wired to the real detector, end to end: the real thing that was in the real books.
const P = await import('../lib/personal.ts');
ok('CHILD TAX CREDIT can never be auto filed, even if somehow taught',
  D.shouldAutoFile({
    source: 'user',
    knownPersonal: null,
    looksPersonal: P.looksPersonal('CHILD TAX CREDIT') !== null,
  }) === false);
ok('but SCREWFIX, taught by him, files itself',
  D.shouldAutoFile({
    source: 'user',
    knownPersonal: null,
    looksPersonal: P.looksPersonal('SCREWFIX') !== null,
  }) === true);


// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nB30, 18 August 2026. What he is SHOWN, what he is ASKED, and which way the money went\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const rows = (n, prefix, amount) => Array.from({ length: n }, (_, i) => ({
  id: `${prefix}-${i}`, vendor: `${prefix} ${i + 1}`,
  amount: typeof amount === 'function' ? amount(i) : (amount ?? -(100 + i)),
  category: 'materials',
}));
const bullets = (text) => text.split('\n').filter((l) => l.startsWith('• ') && !l.startsWith('• and ')).length;

// ─── 1. THE ASKING LIST IS NEVER TRUNCATED, AT ANY SIZE ────────────────────────────────────────
// 🔴 THIS IS THE DEFECT. Until 18 August the builder sliced BOTH lists to eight. A man with twelve
// unrecognised entries read "12 I do not recognise:", saw eight, and then read "Reply YES to file
// those too". handleAck's own comment says "He can only approve what he was shown"; this cap was
// what made that false. The heading count and the line count are now the same number, always.
for (const n of [1, 7, 8, 9, 12, 20]) {
  const msg = D.buildDigest({ filed: [], asking: rows(n, 'Shop') });
  ok(`asking ${n}: every one he is asked about is printed`, bullets(msg) === n);
  const heading = n === 1 ? 'One I do not recognise:' : `${n} I do not recognise:`;
  ok(`asking ${n}: the heading count is the printed count`, msg.includes(heading));
  ok(`asking ${n}: nothing is hidden behind an "and more"`, !/\n• and \d+ more/.test(msg.split('Reply YES')[0]));
}

// ─── 2. THE FILED LIST KEEPS ITS CAP, AND THE ARITHMETIC ADDS UP ───────────────────────────────
// The cap is a good reason for the list he is only being TOLD about, and it is untouched. What is
// checked here is that shown plus more equals the heading, at the boundary and past it.
for (const n of [1, 8, 9, 20]) {
  const msg = D.buildDigest({ filed: rows(n, 'Vendor'), asking: [] });
  const shown = bullets(msg);
  const m = /\n• and (\d+) more/.exec(msg);
  const more = m ? Number(m[1]) : 0;
  ok(`filed ${n}: shown plus "and N more" equals the heading count`, shown + more === n);
  ok(`filed ${n}: never more than eight lines`, shown <= 8);
  ok(`filed ${n}: the "and N more" line appears exactly when something is hidden`, (more > 0) === (n > 8));
}

// ─── 3. WHICH WAY THE MONEY WENT ───────────────────────────────────────────────────────────────
// supabase/schema.sql: "Income vs expense is the sign of `amount`. Expenses are negative." The old
// formatter was Math.abs(), so a £900 sale and a £900 spend printed identically.
{
  const both = D.buildDigest({
    filed: [
      { id: 'a', vendor: 'Travis Perkins', amount: -900, category: 'materials' },
      { id: 'b', vendor: 'Wickes', amount: 900, category: 'labour' },
    ],
    asking: [],
  });
  ok('🔴 an expense and a sale of the same size no longer read the same',
    both.includes('Travis Perkins, £900.00, materials') && both.includes('Wickes, £900.00 in, labour'));
  ok('money out says nothing extra, because reading it was never wrong',
    !/Travis Perkins[^\n]*\bin\b/.test(both));
  const zero = D.buildDigest({ filed: [{ id: 'z', vendor: 'Refund', amount: 0, category: 'other' }], asking: [] });
  ok('a zero row takes the schema\'s own >= 0 branch and says in', zero.includes('Refund, £0.00 in'));
}

// ─── 4. ONE MONEY FORMATTER, AND IT IS lib/money.ts ────────────────────────────────────────────
{
  const big = D.buildDigest({ filed: [{ id: 'a', vendor: 'Travis Perkins', amount: -1034.30, category: 'materials' }], asking: [] });
  ok('🔴 a four figure amount has a thousands separator', big.includes('£1,034.30'));
  ok('and it is not the old bare toFixed', !big.includes('£1034.30'));
  ok('two decimal places, which is the direction of travel', /£1,034\.30/.test(big));
  const src = readFileSync(path.join(lib, 'digest.ts'), 'utf8');
  // ⚠️ COMMENTS STRIPPED FIRST. The block above digest's line() quotes the old formatter in prose
  // to say why it went, so a naive scan fails on its own explanation. Sixth time in this repo.
  // The safe form is the one lib/scotland.ts's suite uses: `(^|[^:])//` never eats an https:// URL.
  const codeOnly = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok('the comment stripper actually strips (vacuity check)',
    !codeOnly('// toFixed(2) in a comment').includes('toFixed')
    && codeOnly("const u = 'https://lekhio.app';").includes('https://lekhio.app'));
  ok('lib/digest.ts has no money formatter of its own any more', !/toFixed\(2\)/.test(codeOnly(src)));
  ok('and it asks lib/money.ts for the one it uses', /from '\.\/money'/.test(src));
}

// ─── 5. THE TWO MESSAGES TELL THE SAME TRUTH ───────────────────────────────────────────────────
// The 00:01 digest said "Nothing here needs you" while the 08:00 template said "You approve
// everything, nothing sends itself". Both were trying to say the same thing and read as opposites.
// The template's words live in Meta and were deliberately left alone; this side names the
// irreversible half so the two agree. Signed off by Jag, 18 August 2026.
{
  const quiet = D.buildDigest({ filed: rows(3, 'Vendor'), asking: [] });
  ok('🔴 the all clear names what never moves without him', quiet.includes('nothing reaches HMRC without your yes'));
  ok('and it still admits its books move on their own', quiet.includes('Entries land in your books on their own'));
  // ⚠️ "here" IS NOT A FILLER AND MUST SURVIVE. R2-F22 put it there because `asking` is scoped to
  // one door, so this sentence can only ever be true of what it looked at.
  ok('and it is still scoped to what it actually looked at', /Nothing here needs you/.test(quiet));
  ok('the all clear is never printed when something IS waiting',
    !D.buildDigest({ filed: rows(3, 'Vendor'), asking: rows(1, 'Shop') }).includes('Nothing here needs you'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
