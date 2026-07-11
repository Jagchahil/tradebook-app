// The daily digest, and the one word that files a day's books. See lib/digest.ts.
//
// What these tests protect: the MONEY. Our whole WhatsApp budget is 19 sends per
// user per month (lib/margin.ts). A digest that sends twice in a day, or sends a
// paid message when the budget is gone, or sends when there is nothing to say, does
// not just annoy someone. It takes the margin under 80%.

import * as D from '../lib/digest.ts';

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

ok('says plainly what it FILED', msg.includes('I filed 3 things for you today'));
ok('and WHY (he already told us)', msg.includes('you have told me about them before'));
ok('names the shop, the money and the category', msg.includes('Screwfix, £84.30, materials'));
ok('asks ONLY about the one it does not know', msg.includes('One I do not recognise'));
ok('and names it', msg.includes('Bob Windows, £340.00'));
ok('offers to learn it', msg.includes('I will remember'));
ok('an "other" category is never printed as if it meant something', !msg.includes(', other'));

// Nothing new: then we do not ask. We just say what we did.
const noQuestion = D.buildDigest({ filed: KNOWN, asking: [] });
ok('NOTHING to ask means NO question is asked', !noQuestion.includes('do not recognise'));
ok('it just says what it did', noQuestion.includes('Nothing needs you'));
ok('and leaves a way to undo', noQuestion.includes('Reply NO'));

// Only new things: no "I filed" claim we did not earn.
const onlyNew = D.buildDigest({ filed: [], asking: NEW });
ok('never claims to have filed something it did not', !onlyNew.includes('I filed'));
ok('one reads as one, not "1 things"', D.buildDigest({ filed: [KNOWN[0]], asking: [] }).includes('I filed one thing'));

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
for (const yes of ['YES', 'yes', 'y', 'Yep', 'ok', 'OK.', 'confirm', 'aye', 'sound', 'yeah']) {
  ok(`"${yes}" means confirm`, D.readReply(yes) === 'confirm');
}
for (const no of ['NO', 'no', 'nope', 'nah', 'wrong']) {
  ok(`"${no}" means leave them`, D.readReply(no) === 'reject');
}

// Anything else is a real message and must NOT be swallowed as an approval.
for (const other of ['spent 40 at screwfix', 'how much tax do i owe', 'yes but not the shell one', '']) {
  ok(`"${other}" is NOT taken as blanket approval`, D.readReply(other) === 'none');
}


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

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
