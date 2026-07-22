// The CRM contact lifecycle rules (pure helpers in lib/crm.ts). Run: node test/crm.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'crm-'));
writeFileSync(path.join(stage, 'crm.ts'), readFileSync(path.join(lib, 'crm.ts'), 'utf8'));
const C = await import(pathToFileURL(path.join(stage, 'crm.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

console.log('\n=== advanceStage: forward only ===\n');
ok('lead -> warming advances', C.advanceStage('lead', 'warming') === 'warming');
ok('warming -> checkout advances', C.advanceStage('warming', 'checkout') === 'checkout');
ok('checkout -> trial advances', C.advanceStage('checkout', 'trial') === 'trial');
ok('trial -> paid advances', C.advanceStage('trial', 'paid') === 'paid');
ok('never regresses: checkout stays on a lead push', C.advanceStage('checkout', 'lead') === 'checkout');
ok('paid never walks back to trial', C.advanceStage('paid', 'trial') === 'paid');
ok('paid never walks back to lead', C.advanceStage('paid', 'lead') === 'paid');
ok('same stage is a no-op', C.advanceStage('warming', 'warming') === 'warming');

console.log('\n=== advanceStage: dormant side-state ===\n');
ok('any stage can go dormant', C.advanceStage('trial', 'dormant') === 'dormant');
ok('paid can be marked dormant (a lapse)', C.advanceStage('paid', 'dormant') === 'dormant');
ok('dormant wakes on real activity', C.advanceStage('dormant', 'checkout') === 'checkout');

console.log('\n=== normaliseWhatsapp ===\n');
ok('keeps a valid +E.164', C.normaliseWhatsapp('+44 7911 123456') === '+447911123456');
ok('adds nothing when no plus', C.normaliseWhatsapp('07911 123456') === '07911123456');
ok('strips spaces, dashes, parens', C.normaliseWhatsapp('+1 (415) 555-2671') === '+14155552671');
ok('rejects too short', C.normaliseWhatsapp('12345') === null);
ok('rejects empty', C.normaliseWhatsapp('') === null);
ok('rejects null', C.normaliseWhatsapp(null) === null);
ok('rejects letters-only', C.normaliseWhatsapp('call me') === null);

console.log('\n=== guards ===\n');
ok('isContactStage true for lead', C.isContactStage('lead') === true);
ok('isContactStage false for junk', C.isContactStage('customer') === false);
ok('isCheckoutStage true for abandoned', C.isCheckoutStage('abandoned') === true);
ok('isEventKind true for wa_sent', C.isEventKind('wa_sent') === true);
ok('isEventKind false for junk', C.isEventKind('exploded') === false);
ok('6 lifecycle stages', C.CONTACT_STAGES.length === 6);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
