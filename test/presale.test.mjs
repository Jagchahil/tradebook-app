// The pre-sale follow-up ladder (pure logic in lib/presale.ts). Run: node test/presale.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'presale-'));
const fix = (s) => s.replace("from './housestyle'", "from './housestyle.ts'");
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
writeFileSync(path.join(stage, 'presale.ts'), fix(readFileSync(path.join(lib, 'presale.ts'), 'utf8')));
const P = await import(pathToFileURL(path.join(stage, 'presale.ts')).href);
let pass = 0, fail = 0; const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

console.log('\n=== ladder + next step ===\n');
ok('ladder is 3 steps', P.PRESALE_LADDER.length === 3);
// 27 July 2026: the ladder went EMAIL ONLY. Every business-initiated WhatsApp message is paid for,
// and a presale lead has by definition not paid us anything yet, so he is the last person worth
// spending a paid template on. The WhatsApp template was retired with it: see RETIRED_TEMPLATES in
// lib/watemplates.ts, which fails the build if the name ever comes back.
ok('step 1 is email, immediate', P.PRESALE_LADDER[0].channel === 'email' && P.PRESALE_LADDER[0].afterHours === 0);
ok('step 3 is email at +72h', P.PRESALE_LADDER[2].channel === 'email' && P.PRESALE_LADDER[2].afterHours === 72);
ok('no step is on WhatsApp any more', P.PRESALE_LADDER.every((s) => s.channel === 'email'));
ok('no step carries a WhatsApp template', P.PRESALE_LADDER.every((s) => s.waTemplate === null));
ok('every step has a subject, because every step is an email', P.PRESALE_LADDER.every((s) => typeof s.subject === 'string' && s.subject.length > 5));
ok('step 2 is email at +20h', P.PRESALE_LADDER[1].channel === 'email' && P.PRESALE_LADDER[1].afterHours === 20);
ok('nextPresaleStep(0) is step 1', P.nextPresaleStep(0).step === 1);
ok('nextPresaleStep(2) is step 3', P.nextPresaleStep(2).step === 3);
ok('nextPresaleStep(3) is null (ladder exhausted)', P.nextPresaleStep(3) === null);

console.log('\n=== due timing ===\n');
const now = 1_000_000_000_000;
ok('step 1 due immediately', P.presaleDue(P.PRESALE_LADDER[0], new Date(now).toISOString(), now) === true);
ok('step 2 not due at +1h', P.presaleDue(P.PRESALE_LADDER[1], new Date(now - 3600_000).toISOString(), now) === false);
ok('step 2 due at +20h', P.presaleDue(P.PRESALE_LADDER[1], new Date(now - 20 * 3600_000).toISOString(), now) === true);

console.log('\n=== consent gating ===\n');
// The WhatsApp branch of stepSendable is deliberately KEPT even though no step uses it today. If a
// WhatsApp step ever earns its place back it returns as a step, not as a rewrite, so the consent
// rule stays tested rather than rotting.
ok('a hypothetical WhatsApp step still needs a number and consent', P.stepSendable({ channel: 'whatsapp' }, { hasWhatsapp: true, waConsent: true, hasEmail: false, emailOk: false }) === true);
ok('a hypothetical WhatsApp step is blocked without consent', P.stepSendable({ channel: 'whatsapp' }, { hasWhatsapp: true, waConsent: false, hasEmail: true, emailOk: true }) === false);
ok('step 1 now needs an email address', P.stepSendable(P.PRESALE_LADDER[0], { hasWhatsapp: true, waConsent: true, hasEmail: false, emailOk: false }) === false);
ok('email step needs consent + not unsubscribed', P.stepSendable(P.PRESALE_LADDER[1], { hasWhatsapp: false, waConsent: false, hasEmail: true, emailOk: true }) === true);

console.log('\n=== copy ===\n');
ok('firstName picks the first name', P.firstName('Dev Malhi') === 'Dev');
ok('firstName falls back to there', P.firstName('') === 'there');
const m1 = P.presaleMessage(P.PRESALE_LADDER[0], 'Dev');
ok('step 1 greets by name', m1.includes('Hi Dev'));
ok('copy carries no forbidden dash', !/[–—−]|\s-\s/.test(m1 + P.presaleMessage(P.PRESALE_LADDER[1], null) + P.presaleMessage(P.PRESALE_LADDER[2], 'Sam')));
ok('ships dark by default', P.PRESALE_ENABLED() === false);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
