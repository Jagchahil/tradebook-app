// A VOICE NOTE THAT WAS PARKED, AND THE APOLOGY THAT ASKED FOR IT TWICE.
//
//   node test/voicejob.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// TWO DEFECTS IN ONE SUBSYSTEM, BOTH FOUND ON 9 AUGUST 2026, BOTH ABOUT A MAN LEFT WAITING.
//
// 1. 🔴 createVoiceJob RETURNED null FOR TWO OPPOSITE THINGS.
//
//    Null was reached when the insert was REFUSED, and also when the insert SUCCEEDED and reading
//    the answer threw. PostgREST answers 201, the row is there, THE AUDIO IS PARKED, and the
//    webhook sent "I could not take that voice note just now. Try again". So he records it a
//    second time, the mini transcribes both, and the same expense lands in his books twice.
//
//    ⚠️ AND IT BROKE A GUARANTEE ANOTHER FILE STATES IN WRITING. handleVoiceNote says "a throw can
//    only ever happen before the queue write, so nothing is parked, and telling him to send it
//    again cannot double count him." True of every line except the one that caught its own post
//    write throw and returned a refusal.
//
// 2. 🔴 THE REAPER SAT BEHIND A DOOR ONLY THE MAC MINI OPENS.
//
//    reapStaleVoiceJobs ran from /api/voice/pending and nowhere else. That endpoint is polled by
//    the mini. The commonest reason a note goes stale is THAT THE MINI WAS DOWN, and a mini that is
//    down is not polling, so a note lost to an outage was never reaped, the customer was never told
//    anything after "writing it up now, one sec", AND HIS AUDIO STAYED ON OUR DISK. lib/voicejobs.ts
//    opens by promising the opposite: a voice note "never rests on our disk longer than the one job
//    needs".
//
// 🔴 SO THIS RATCHET GUARDS FIVE FAILURES.
//
//   1. THE THREE ANSWERS COLLAPSE BACK INTO TWO, or 'unsure' starts inviting a resend.
//   2. A 2xx WHOSE BODY IS NOT JSON BECOMES A REFUSAL AGAIN. It is the same shape as the
//      lib/claude.ts sweep, and the same res.json() that caused it.
//   3. A REFUSAL STOPS BEING A REFUSAL. Erring the other way leaves a man who really was refused
//      waiting on a note that does not exist, which the reaper cannot fix because there is no row.
//   4. THE CRON LOSES THE REAPER, on either slot, or the route loses its bearer.
//   5. THE APOLOGY BECOMES TWO LITERALS AGAIN. Two doors reap now. One sentence.
//
// ⚠️ THE BEHAVIOUR IS EXERCISED, NOT READ. fetch is stubbed and the real createVoiceJob is called
// against a refusal, a 201 with a good body, a 201 with an HTML body and a fetch that rejects.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'voicejob-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};

// Read at load time by base(); neither is real and nothing is ever sent, because fetch is stubbed
// for every call below.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://voicejob-suite.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'voicejob-suite-not-a-real-key';

stageModule('voicejobs');
const VJ = await import(pathToFileURL(path.join(stage, 'voicejobs.ts')).href);

const jobsSrc = src('lib/voicejobs.ts');
const waSrc = src('app/api/whatsapp/route.ts');
const dailySrc = src('app/api/cron/daily/route.ts');
const reapSrc = src('app/api/cron/voicereap/route.ts');
const pendingSrc = src('app/api/voice/pending/route.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── The module is the module we think it is. ─────────────────────────────────────────────────
ok('🔴 createVoiceJob EXISTS AND IS CALLABLE, without which nothing below means anything',
  typeof VJ.createVoiceJob === 'function');
ok('and the shared apology is exported rather than living in a route',
  typeof VJ.VOICE_REAPED_APOLOGY === 'string' && VJ.VOICE_REAPED_APOLOGY.length > 40);
ok('all five sources read, none of them empty',
  jobsSrc.length > 1000 && waSrc.length > 1000 && dailySrc.length > 500
  && reapSrc.length > 500 && pendingSrc.length > 500);

// ── The four answers a database can give, each run for real. ─────────────────────────────────
const realFetch = globalThis.fetch;
const NOTE = { userId: 'u1', fromPhone: '+447700900123', messageId: 'wamid.1', audioBase64: 'AAA', mimeType: 'audio/ogg' };
async function park(handler) {
  globalThis.fetch = handler;
  try {
    return await VJ.createVoiceJob(NOTE);
  } finally {
    globalThis.fetch = realFetch;
  }
}
const answer = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

const created = await park(answer(201, JSON.stringify([{ id: 'job-1' }])));
ok('🔴 A GOOD INSERT IS created, AND CARRIES THE ID, so the happy path still works',
  created.kind === 'created' && created.id === 'job-1');

const refused = await park(answer(400, '{"message":"bad request"}'));
ok('🔴 THE SERVER SAYING NO IS refused, which is the ONLY answer that may ask him to send it again',
  refused.kind === 'refused');

const gateway = await park(answer(201, '<!DOCTYPE html><html><body>Gateway</body></html>'));
ok('🔴 A 201 WHOSE BODY IS NOT JSON IS unsure, NEVER refused: the row is there and the audio is parked',
  gateway.kind === 'unsure');

const emptyBody = await park(answer(201, '[]'));
ok('a 201 that came back with no row is unsure too, because the insert still succeeded',
  emptyBody.kind === 'unsure');

const died = await park(async () => { throw new Error('socket hang up'); });
ok('🔴 A FETCH THAT REJECTS IS unsure: a connection that dies mid flight may have been delivered',
  died.kind === 'unsure');

ok('🔴 AND createVoiceJob NEVER THROWS, which is the guarantee handleVoiceNote states in writing',
  [created, refused, gateway, emptyBody, died].every((r) => r && typeof r.kind === 'string'));
ok('the three kinds are the only three, so no caller can be handed a fourth it does not handle',
  new Set([created.kind, refused.kind, gateway.kind, emptyBody.kind, died.kind]).size === 3);

// ── The webhook answers each of the three differently, and only one invites a resend. ────────
ok('the three sentences all exist',
  /const VOICE_ON_IT = '/.test(waSrc) && /const VOICE_NOT_TAKEN = '/.test(waSrc) && /const VOICE_MAYBE = '/.test(waSrc));
ok('🔴 THE WEBHOOK BRANCHES ON THE KIND, not on truthiness',
  /if \(parked\.kind === 'created'\) return VOICE_ON_IT;/.test(waSrc)
  && /if \(parked\.kind === 'refused'\) return VOICE_NOT_TAKEN;/.test(waSrc)
  && /return VOICE_MAYBE;/.test(waSrc));
ok('🔴 THE OLD TRUTHY TEST IS GONE, so a result object cannot be read as "it worked"',
  !/if \(!jobId\) return VOICE_NOT_TAKEN;/.test(waSrc));

const maybe = /const VOICE_MAYBE = '([^']*)';/.exec(waSrc);
ok('the maybe sentence is where this file thinks it is',
  maybe !== null);
if (maybe) {
  ok('🔴 AND IT DOES NOT ASK HIM TO SEND IT AGAIN, which is the whole point of telling the two apart',
    !/send it again|try again|send another/i.test(maybe[1]));
  ok('it tells him to wait instead, and promises he will hear either way',
    /rather than sending it again/i.test(maybe[1]) && /come back to you/i.test(maybe[1]));
  ok('no forbidden dashes in it',
    !/[–—]/.test(maybe[1]));
}
const notTaken = /const VOICE_NOT_TAKEN = '([^']*)';/.exec(waSrc);
ok('🔴 AND THE REFUSAL STILL DOES ASK HIM TO, so this is not a guard that silenced both arms',
  notTaken !== null && /Try again/.test(notTaken[1]));

// ── The reaper is on a clock, not only behind the mini's door. ───────────────────────────────
ok('🔴 THE CRON ROUTE EXISTS AND CALLS THE REAPER',
  /reapStaleVoiceJobs\(\)/.test(reapSrc));
ok('🔴 AND IT IS BEHIND THE SAME BEARER AS EVERY OTHER CRON, closed when the secret is unset',
  /const secret = process\.env\.CRON_SECRET;/.test(reapSrc)
  && /if \(!secret\) return false;/.test(reapSrc)
  && /crypto\.timingSafeEqual/.test(reapSrc)
  && /if \(!authorised\(req\)\) return NextResponse\.json\(\{ error: 'unauthorized' \}, \{ status: 401 \}\)/.test(reapSrc));
ok('🔴 THE DISPATCHER KICKS IT ON BOTH SLOTS, so an outage is bounded rather than open ended',
  (dailySrc.match(/'\/api\/cron\/voicereap'/g) || []).length === 2);
ok('and the mini\'s own door still reaps, because that is the fast path when the mini is up',
  /reapStaleVoiceJobs\(\)/.test(pendingSrc));

// ── One sentence, two doors. ─────────────────────────────────────────────────────────────────
ok('🔴 BOTH DOORS SEND THE ONE EXPORTED SENTENCE',
  /VOICE_REAPED_APOLOGY/.test(reapSrc) && /VOICE_REAPED_APOLOGY/.test(pendingSrc));
ok('🔴 AND NEITHER KEEPS A COPY OF IT',
  !/Sorry, I could not write up that voice note in time/.test(reapSrc)
  && !/Sorry, I could not write up that voice note in time/.test(pendingSrc));
ok('the sentence itself still tells him what to do about it',
  /Send it again, or a photo of the receipt/.test(VJ.VOICE_REAPED_APOLOGY));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
ok('no en dash or em dash in the queue module or the new cron route',
  !/[–—]/.test(jobsSrc) && !/[–—]/.test(reapSrc));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
