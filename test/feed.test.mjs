// THE FEED. The activity record at /app/feed and its reader readActivityFeed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, IN THE ORDER THE FAILURES WOULD HURT:
//
//   1. 🔴 TENANCY. readActivityFeed is staged with a recording fetch and ATTACKED at runtime:
//      every one of its three reads must carry user_id from the session, and no raw row id may
//      ever leave the function. A chat or nudge row travels only inside a sealed chatref link,
//      a transaction row only inside a sealed entryref link, and an unmintable reference fails
//      closed to '' rather than falling back to the id.
//
//   2. 🔴 HONESTY. Any failed source read is null, never a quietly shorter list: a feed that
//      silently forgets a source teaches a man the record cannot be trusted. [] means nothing
//      has genuinely happened, and the page draws ONE quiet line for it, not a scaffold.
//
//   3. The merge: three sources, one clock, newest first, cut to the limit.
//
//   4. The page: server rendered, session first, the nav carried, the sentences taken from the
//      reader rather than reworded, and no pound ever built by hand.
//
// Source pins plus logic tests, in the style of test/thread.test.mjs.
// Run: node test/feed.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Assert on the CODE, never on the words around it, same rule as test/thread.test.mjs.
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const pageSrc = read('app/app/feed/page.tsx');
const pageCode = stripComments(pageSrc);
// The rendering itself, one copy, worn by /app/feed AND by Home since the 5 August shell change.
const compSrc = read('app/app/Feed.tsx');
const compCode = stripComments(compSrc);
const homeSrc = read('app/app/page.tsx');
const homeCode = stripComments(homeSrc);
const navSrc = read('app/app/AppNav.tsx');
const dbSrc = read('lib/supabase.ts');

console.log('\nfeed: the record of what Lekhio has been doing, his rows only');

// ---------------------------------------------------------------------------------------------
// 1. THE PAGE. Server rendered, session first, nav carried, worded by the reader.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the page ===\n');

ok('no client JavaScript: not a client component, no handlers, no hooks, no script tag',
  !/^'use client'/m.test(pageSrc)
  && !/onClick|onChange|onSubmit|useState|useEffect|<script/.test(pageCode));
ok('the session is resolved first and a signed out visitor is sent to /in',
  pageCode.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageCode));
ok('the shell is carried and names this route', pageSrc.includes('<AppNav current="/app/feed"'));
ok('the rows come from readActivityFeed in lib/supabase.ts, already worded',
  pageCode.includes('readActivityFeed(user.id'));
// The moneylog pattern: the reference minters are handed in by the page, closed over the
// SESSION user, because lib/ is staged flat by test/waout.test.mjs and cannot import app/app.
ok('🔴 the sealed reference minters are handed in, closed over the session user',
  pageCode.includes('chat: (kind, id) => chatRef(user.id, kind, id)')
  && pageCode.includes('entry: (id, month) => entryRef(user.id, id, month)'));
ok('🔴 the page never builds a pound itself: the money arrives inside the reader\'s sentences',
  !/`£\$\{|['"]£['"]\s*\+|\+\s*['"]£['"]/.test(pageCode));

// ---------------------------------------------------------------------------------------------
// 1b. THE RENDERER. One copy, in app/app/Feed.tsx, since Home started carrying the feed too.
// A second copy of this markup is the sharedcss lesson: one gets fixed, the other one ships.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the renderer, written once ===\n');

ok('the page draws through the shared renderer', pageCode.includes('<FeedDays items={items} now={now} />')
  && pageSrc.includes("from '../Feed'"));
ok('the renderer ships no client JavaScript either',
  !/^'use client'/m.test(compSrc)
  && !/onClick|onChange|onSubmit|useState|useEffect|<script/.test(compCode));
ok('a failed read is said plainly, never drawn as an empty account',
  compCode.includes('We could not read your feed just now.'));
// Doc 103's empty test: one quiet line, telling him how to make the first thing happen, and no
// scaffold of day headings around nothing.
const emptyBranch = compCode.slice(compCode.indexOf('items.length === 0'), compCode.indexOf('const days'));
ok('the empty state is ONE quiet line', (emptyBranch.match(/<p /g) || []).length === 1);
ok('...and it says what will appear', emptyBranch.includes('The first receipt you send appears here'));
// The frontdoor rule: no screen inside /app may instruct a WhatsApp action, because the man
// reading may have no number bound yet. The feed's words stay channel neutral.
ok('...without instructing a WhatsApp send', !/WhatsApp/.test(pageCode) && !/WhatsApp/.test(compCode));
ok('the days are grouped under plain headings: Today, Yesterday, then the date',
  compCode.includes("return 'Today'") && compCode.includes("return 'Yesterday'")
  && compCode.includes("weekday: 'long'"));
ok('times and dates are read in the man\'s own clock, London',
  (compSrc.match(/Europe\/London/g) || []).length >= 3);
ok('a row with no reference renders readable and unlinked, the fail closed rule',
  /item\.ref \? \(/.test(compCode) && compCode.includes('<div key='));
ok('links go through the ref the reader minted, never an id the page assembled',
  compCode.includes('href={item.ref}') && !/[?&](id|tx|conversation)=/.test(compCode));
ok('the row markup lives ONLY in the renderer: neither page retypes it',
  !pageCode.includes('lek-feed-row') && !homeCode.includes('lek-feed-row')
  && compCode.includes('lek-feed-row'));

// ---------------------------------------------------------------------------------------------
// 2. THE SHELL. Since 5 August 2026 Home IS overview plus feed: the same record flows under the
// figures, from the same reader, with the same sealed minters, and /app/feed keeps the record as
// a page of its own, opened from the heading on Home. The shell lights the Home tab for it.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the shell, and home carrying the feed ===\n');

const sections = navSrc.slice(navSrc.indexOf('export const SECTIONS'), navSrc.indexOf('function TabIcon'));
ok('the shell knows /app/feed and it lights the Home tab',
  /href: '\/app\/feed', label: 'Feed'/.test(sections)
  && sections.indexOf("label: 'Home'") < sections.indexOf("label: 'Feed'")
  && sections.indexOf("label: 'Feed'") < sections.indexOf("label: 'Money'"));
ok('🔴 HOME RENDERS THE FEED UNDER ITS FIGURES, through the same renderer',
  homeCode.includes('<FeedDays items={feedItems} now={now} />') && homeSrc.includes("from './Feed'"));
ok('🔴 and home reads it with the same sealed minters, closed over the session user',
  homeCode.includes('readActivityFeed(user.id')
  && homeCode.includes('chat: (kind, id) => chatRef(user.id, kind, id)')
  && homeCode.includes('entry: (id, month) => entryRef(user.id, id, month)'));
ok('the figures come FIRST: the feed sits below the footer line, never above the tax card',
  homeSrc.indexOf('<FeedDays') > homeSrc.indexOf('S.foot'));
ok('home links the record as its own page', homeSrc.includes('href="/app/feed"'));

// ---------------------------------------------------------------------------------------------
// 3. 🔴 THE READER, ATTACKED AT RUNTIME. Staged with a recording fetch and stub minters.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the reader, attacked ===\n');

// Stage the thread block (the feed reuses its rakhaFlagsForUser) plus the feed block, with stub
// config, headers and reference minters, so the real functions run against a recorder.
const START = '// --- The Lekhio thread (31 July 2026';
const FEED_END = '// --- end of the activity feed block';
const si = dbSrc.indexOf(START);
const ei = dbSrc.indexOf(FEED_END);
ok('the feed block exists in lib/supabase.ts, after the thread block, with its end marker',
  si > -1 && ei > si && dbSrc.includes('// --- The activity feed (5 August 2026)'));

const block = dbSrc.slice(si, ei);
ok('the block reuses rakhaFlagsForUser rather than growing a fourth signals query',
  block.includes('rakhaFlagsForUser(userId, cap)'));

const stage = mkdtempSync(path.join(tmpdir(), 'feed-'));
writeFileSync(
  path.join(stage, 'feed.ts'),
  [
    "const config = () => ({ url: 'https://db.test', key: 'k' });",
    'const headers = (extra: Record<string, string> = {}): Record<string, string> => ({ ...extra });',
    // The real labelFor and gbp2 semantics, small enough to restate: the name is never empty and
    // the sign sits outside the pound.
    "const labelFor = (r: Record<string, unknown>): string => (typeof r.vendor === 'string' && r.vendor.trim()) || (typeof r.description === 'string' && r.description.trim()) || 'No name on it';",
    "const gbp2 = (n: number): string => `£${Math.abs(n).toFixed(2)}`;",
    block,
  ].join('\n'),
);
const F = await import(pathToFileURL(path.join(stage, 'feed.ts')).href);

const calls = [];
let script = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : null });
  const next = script.shift() || { status: 200, json: [] };
  return new Response(JSON.stringify(next.json ?? []), { status: next.status ?? 200 });
};
// The seal handed in, exactly as the page hands it: a recorder that NEVER echoes the id, so an
// assertion that an id leaked can only be satisfied by the reader itself leaking it.
const mint = [];
let sealedOn = true;
const seal = {
  chat: (kind, id) => { mint.push(['chat', kind, id]); return sealedOn ? `sealed-${kind}` : ''; },
  entry: (id, month) => { mint.push(['entry', id, month]); return sealedOn ? 'sealed-entry' : ''; },
};
const reset = (s) => { calls.length = 0; mint.length = 0; script = s; };

const TX = '1a2b3c4d-1111-4111-8111-aaaaaaaaaaaa';
const CONV = '5e6f7a8b-2222-4222-8222-bbbbbbbbbbbb';
const SIG = '9c0d1e2f-3333-4333-8333-cccccccccccc';

const txRows = [
  { id: TX, vendor: 'Screwfix', amount: -164.78, category: 'materials', confirmed: false, is_personal: false, source_type: 'whatsapp_image', created_at: '2026-08-05T09:30:00Z', transaction_date: '2026-08-05' },
  { id: TX, vendor: 'EE Limited', amount: -45.6, category: 'phone', confirmed: true, is_personal: false, source_type: 'whatsapp_image', created_at: '2026-08-04T12:00:00Z', transaction_date: '2026-08-04' },
  { id: TX, vendor: 'J Smith', amount: 540, category: null, confirmed: true, is_personal: false, source_type: 'invoice', created_at: '2026-08-03T08:00:00Z', transaction_date: '2026-08-03' },
];
const turnRows = [
  { conversation_id: CONV, role: 'user', content: 'Can I claim the van?', created_at: '2026-08-05T08:00:00Z' },
];
const flagRows = [
  { id: SIG, signal_key: 'vat_threshold', payload: { title: 'You are about £900 from the VAT threshold.', body: 'the stored why' }, created_at: '2026-08-04T02:00:00Z' },
];

// The happy path: three scoped reads, one merged clock, the worded sentences.
reset([{ json: txRows }, { json: turnRows }, { json: flagRows }]);
const feed = await F.readActivityFeed('alice', 40, seal);
ok('🔴 every one of the three reads is scoped by user_id from the session',
  calls.length === 3 && calls.every((c) => c.url.includes('user_id=eq.alice')));
ok('🔴 and every read is a GET: the feed is a record, it changes nothing',
  calls.every((c) => c.method === 'GET'));
ok('the transactions read carries the columns the sentences need, newest first',
  calls[0].url.includes('/rest/v1/transactions?')
  && calls[0].url.includes('select=id,vendor,amount,category,confirmed,is_personal,source_type,created_at,transaction_date')
  && calls[0].url.includes('order=created_at.desc'));
ok('the messages read is one query across his conversations, newest first',
  calls[1].url.includes('/rest/v1/messages?') && calls[1].url.includes('order=created_at.desc'));
ok('the signals read is rakhaFlagsForUser\'s own shape: not dismissed, newest first',
  calls[2].url.includes('/rest/v1/agent_signals?') && calls[2].url.includes('dismissed_at=is.null'));

ok('the merge holds every source and comes back newest first across them',
  Array.isArray(feed) && feed.length === 5
  && feed.map((i) => i.kind).join(',') === 'receipt,chat,filed,nudge,filed');

const [receipt, chat, filed, nudgeItem, income] = feed;
ok('a receipt read waits for his yes, money to the penny through lib/money.ts',
  receipt.title === 'Read your Screwfix receipt.'
  && receipt.detail === '£164.78, waiting for your yes.');
ok('a confirmed cost is filed as its category, in the promised words',
  filed.title === 'Filed EE Limited as phone.' && filed.detail === '£45.60 out.');
ok('confirmed money in is filed as money in', income.title === 'Filed £540.00 in from J Smith.');
ok('a chat turn carries who spoke and a one line snippet',
  chat.kind === 'chat' && chat.title === 'You asked.' && chat.detail === 'Can I claim the van?');
ok('a Rakha nudge speaks in Rakha\'s stored words',
  nudgeItem.kind === 'nudge' && nudgeItem.title === 'You are about £900 from the VAT threshold.');

// 🔴 The references. Sealed links only, minted for the session's user, never a raw id.
ok('🔴 a transaction row links through a sealed entry reference',
  receipt.ref === `/app/entry?e=${encodeURIComponent('sealed-entry')}`
  && mint.some(([w, r, m]) => w === 'entry' && r === TX && m === '2026-08'));
ok('🔴 a chat row links through a sealed chat reference',
  chat.ref === `/app/thread/chat?c=${encodeURIComponent('sealed-chat')}`
  && mint.some(([w, k, i]) => w === 'chat' && k === 'chat' && i === CONV));
ok('🔴 a nudge links through a sealed rakha reference',
  nudgeItem.ref === `/app/thread/chat?c=${encodeURIComponent('sealed-rakha')}`
  && mint.some(([w, k, i]) => w === 'chat' && k === 'rakha' && i === SIG));
ok('🔴 NO RAW ID LEAVES THE READER, in a ref or anywhere else',
  feed.every((i) => !i.ref.includes(TX) && !i.ref.includes(CONV) && !i.ref.includes(SIG)
    && !i.title.includes(TX) && !i.detail.includes(CONV)));

// Unmintable references fail closed to '', and the rows still come back readable.
sealedOn = false;
reset([{ json: txRows }, { json: turnRows }, { json: flagRows }]);
const unlinked = await F.readActivityFeed('alice', 40, seal);
ok('an unmintable reference is \'\', never an id and never a broken link',
  Array.isArray(unlinked) && unlinked.length === 5 && unlinked.every((i) => i.ref === ''));
sealedOn = true;

// Honesty. Any failed source is null; genuinely nothing is [].
reset([{ status: 500 }, { json: turnRows }, { json: flagRows }]);
ok('🔴 a failed transactions read is null, never a feed quietly missing his money',
  (await F.readActivityFeed('alice', 40, seal)) === null);
reset([{ json: txRows }, { json: turnRows }, { status: 500 }]);
ok('🔴 a failed signals read is null too: the record is whole or it says so',
  (await F.readActivityFeed('alice', 40, seal)) === null);
reset([{ json: [] }, { json: [] }, { json: [] }]);
const nothing = await F.readActivityFeed('alice', 40, seal);
ok('nothing has happened yet is [], the honest empty state',
  Array.isArray(nothing) && nothing.length === 0);
reset([]);
ok('no user means no queries at all', (await F.readActivityFeed('', 40, seal)) === null && calls.length === 0);

// The limit bounds every read and the merged list.
reset([{ json: txRows }, { json: turnRows }, { json: flagRows }]);
const two = await F.readActivityFeed('alice', 2, seal);
ok('the limit rides every query and cuts the merge, newest kept',
  calls.every((c) => c.url.includes('limit=2'))
  && Array.isArray(two) && two.length === 2 && two[0].kind === 'receipt' && two[1].kind === 'chat');

// A row the sentences cannot be honest about is dropped, not guessed at.
reset([{ json: [{ id: TX, vendor: 'x', amount: 'not a number', confirmed: true, created_at: '2026-08-05T09:30:00Z' }] }, { json: [] }, { json: [] }]);
const dropped = await F.readActivityFeed('alice', 40, seal);
ok('a row with no usable amount is dropped rather than rendered as £NaN',
  Array.isArray(dropped) && dropped.length === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
