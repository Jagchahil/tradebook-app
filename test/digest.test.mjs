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

// --- the message ---------------------------------------------------------------
const entries = [
  { id: '1', vendor: 'Screwfix', amount: -84.3, category: 'materials' },
  { id: '2', vendor: 'Shell', amount: -62.15, category: 'fuel' },
  { id: '3', vendor: 'Toolstation', amount: -23.1, category: 'materials' },
];
const msg = D.buildDigest(entries);

ok('names the shop, the money and the category', msg.includes('Screwfix, £84.30, materials'));
ok('counts them', msg.includes('3 things landed'));
ok('asks for the one word', msg.includes('Reply YES'));
ok('offers the way out too', msg.includes('NO'));
ok('never claims it has been counted (the approval gate)', !/counted|filed already|added to your tax/i.test(msg));

const one = D.buildDigest([entries[0]]);
ok('one entry reads as one, not "1 things"', one.includes('One thing landed'));

ok('nothing to say means no message at all', D.buildDigest([]) === null);

// "other" is not a category worth printing.
const vague = D.buildDigest([{ id: '9', vendor: 'Bob Windows', amount: -40, category: 'other' }]);
ok('an "other" category is not printed as if it meant something', !vague.includes('other'));
ok('but the shop and the money still are', vague.includes('Bob Windows, £40.00'));

// A long day does not become a wall of text.
const many = Array.from({ length: 14 }, (_, i) => ({ id: String(i), vendor: `Shop ${i}`, amount: -10, category: 'materials' }));
const big = D.buildDigest(many);
ok('a long list is capped', (big.match(/•/g) || []).length <= 8);
ok('and honest about the rest', big.includes('6 more in the app'));

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

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
