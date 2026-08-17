// SABOTAGE WHO HE IS AND WHETHER HE CAN CHANGE IT. B1, 17 AUGUST 2026.
//
//   node test/sabotage-identityprofile.mjs
//
// Every sabotage below is a way the B1 finding comes back: an answer captured at /start that never
// reaches the account, a fact on the account with no door he can reach it through, or a sentence
// pointing at a door that is not there. If one of these goes green, the guard is decoration.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-id-'));
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return dir;
}
function runSuites(dir) {
  for (const t of ['test/identityprofile.test.mjs', 'test/personname.test.mjs']) {
    try {
      const out = execFileSync('node', [path.join(dir, t)], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (/[1-9]\d* failed\./.test(out)) return true;
    } catch { return true; }
  }
  return false;
}
const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};
const del = (dir, rel) => rmSync(path.join(dir, rel), { force: true });

const SABOTAGES = [
  // ── The trade, which is the original bug ─────────────────────────────────────────────────
  {
    name: '🔴 the trade word is selected and then thrown away again, which IS the finding',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '  if (s.trade && !patch.trade_type) {\n    const word = String(s.trade).trim().slice(0, 40);\n    if (word) patch.trade_type = word;\n  }', ''),
  },
  {
    name: 'the reconcile SELECT drops the trade column, so the word arrives undefined',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'select=trade_type,trade,name,person_name,address', 'select=trade_type,name,person_name,address'),
  },
  {
    name: '🔴 the STRUCTURE is written into the trade column, which is the trap the comment marks',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'const word = String(s.trade).trim().slice(0, 40);', 'const word = String(s.trade_type).trim().slice(0, 40);'),
  },
  {
    name: 'the write is moved after the patch is sent, so it never lands',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '  if (s.trade && !patch.trade_type) {\n    const word = String(s.trade).trim().slice(0, 40);\n    if (word) patch.trade_type = word;\n  }\n', ''),
  },
  {
    name: 'it stops checking the field is unset, so a reconcile re run undoes what he typed in Settings',
    apply: (d) => edit(d, 'lib/supabase.ts', 'if (s.trade && !patch.trade_type) {', 'if (s.trade) {'),
  },
  {
    name: 'createSignup stops storing the trade word, so there is nothing to carry',
    apply: (d) => edit(d, 'lib/supabase.ts', '  if (signup.trade) record.trade = signup.trade;', ''),
  },
  // ── The writer ───────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 an undrawn box becomes a cleared one, so a sole trader saving his address wipes a business name he cannot see',
    apply: (d) => edit(d, 'lib/supabase.ts', '    if (given === undefined) continue;', ''),
  },
  {
    name: 'a cleared box stops clearing, so he can never take his address off his own invoices',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "    patch[IDENTITY_COLUMN[key]] = trimmed === '' ? null : trimmed;",
      '    patch[IDENTITY_COLUMN[key]] = trimmed;'),
  },
  {
    name: 'the length clamp is dropped at the writer, leaving only the route between a form and the column',
    apply: (d) => edit(d, 'lib/supabase.ts', ".trim().slice(0, IDENTITY_MAX[key]);", '.trim();'),
  },
  {
    name: '🔴 an empty patch is sent anyway: PostgREST matches every row for the filter, succeeds, and says nothing',
    apply: (d) => edit(d, 'lib/supabase.ts', '  if (Object.keys(patch).length === 0) return true;', ''),
  },
  {
    name: 'the trade column is dropped from the writer, so Settings cannot set what /start now stores',
    apply: (d) => edit(d, 'lib/supabase.ts', "  trade: 'trade_type',\n};", '};'),
  },
  // ── The door ─────────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the route is deleted, and the profile is write once again',
    apply: (d) => del(d, 'app/api/you/details/route.ts'),
  },
  {
    name: 'the route stops asking whose session it is',
    apply: (d) => edit(d, 'app/api/you/details/route.ts', 'const user = await sessionUser(req);', 'const user = { id: String(req.headers.get("x-user") ?? "") };'),
  },
  {
    name: 'the burst limit comes off a route that writes his identity',
    apply: (d) => edit(d, 'app/api/you/details/route.ts', "if (await userBurst('you-details', user.id)) return back(req, 'slow');", ''),
  },
  {
    name: '🔴 form.has becomes a plain read, so every box the form did not draw is written as null',
    apply: (d) => edit(d, 'app/api/you/details/route.ts', "if (form.has('business_name'))", "if (true)"),
  },
  {
    name: 'the gate row is dropped, so the route ships ungoverned',
    apply: (d) => edit(d, 'lib/gate.ts', "  { route: 'app/api/you/details', rule: 'always',", "  { route: 'app/api/you/detailsX', rule: 'always',"),
  },
  {
    name: "🔴 his own name goes behind the paywall, and with it a field GOV.UK asks every invoice to carry",
    apply: (d) => edit(d, 'lib/gate.ts', "{ route: 'app/api/you/details', rule: 'always',", "{ route: 'app/api/you/details', rule: 'entitled',"),
  },
  // ── The screen ───────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the address box loses its prefill, so opening Settings and pressing Save wipes his address',
    apply: (d) => edit(d, 'app/app/you/settings/page.tsx', "defaultValue={card?.address ?? ''}", "defaultValue={''}"),
  },
  {
    name: 'the trade box loses its prefill, same shape, quieter loss',
    apply: (d) => edit(d, 'app/app/you/settings/page.tsx', "defaultValue={card?.trade ?? ''}", "defaultValue={''}"),
  },
  {
    name: 'readIdentityCard stops selecting the address, so the box is empty however right the form is',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '&select=name,business_name,trade_type,address,phone_number,phone_verified_at&limit=1',
      '&select=name,business_name,trade_type,phone_number,phone_verified_at&limit=1'),
  },
  {
    name: 'the business name box is drawn for everybody, inviting a sole trader to invent a trading name',
    apply: (d) => edit(d, 'app/app/you/settings/page.tsx', '{businessShaped ? (', '{true ? ('),
  },
  {
    name: 'a trading name stops counting, so a sole trader with one cannot correct it',
    apply: (d) => edit(d, 'app/app/you/settings/page.tsx', "    || Boolean((card?.businessName ?? '').trim());", ';'),
  },
  // ── The invoice ──────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the invoice screen stops mentioning the missing address, and INV-0001 happens again',
    apply: (d) => edit(d, 'app/app/invoices/new/page.tsx', '{ownAddressMissing ? (', '{false ? ('),
  },
  {
    name: 'a failed read is read as an absent address, sending a man to fix what is already there',
    apply: (d) => edit(d, 'app/app/invoices/new/page.tsx',
      "const ownAddressMissing = identityCard !== null && !(identityCard.address ?? '').trim();",
      "const ownAddressMissing = !(identityCard?.address ?? '').trim();"),
  },
  {
    name: 'the line loses its door, becoming a complaint rather than a fix',
    apply: (d) => edit(d, 'app/app/invoices/new/page.tsx',
      '<a href="/app/you/settings" style={S.ownAddressLink}>add it in Settings</a>', 'add it in Settings'),
  },
  // ── The sentences ────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the testimonial points at Your details again, which is nowhere',
    apply: (d) => edit(d, 'app/app/you/testimonial/page.tsx', 'Add one under Your details in Settings', 'Add one under Your details'),
  },
  {
    name: '/app/you goes back to promising the pages below',
    apply: (d) => edit(d, 'app/app/you/page.tsx',
      "your name, your\n              trade and your business address in{' '}\n              <a href=\"/app/you/settings\" style={S.inlineLink}>Settings</a>, and the rest comes",
      'and the rest comes'),
  },
  {
    name: '🔴 /start claims again that the trade sorts his expenses, which the categoriser does not do',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'sub="It goes on your details, and you can change it later in Settings. Landlord is the one that changes things: it tells us the letting is the business itself, so we stop asking you trade questions that cannot apply to you."',
      'sub="We use this to sort your expenses into the right categories automatically."'),
  },
];

const CONTROLS = [
  {
    name: 'a comment is reworded in the writer',
    apply: (d) => edit(d, 'lib/supabase.ts', '// One user\'s reminder preferences, with the three states kept apart.',
      '// One user\'s reminder preferences, with the three states kept apart (comment touched).'),
  },
  {
    name: 'the address max length is raised, which is the file doing its job',
    apply: (d) => edit(d, 'lib/supabase.ts', '  address: 300,\n  trade: 40,', '  address: 400,\n  trade: 40,'),
  },
  {
    name: 'whitespace before the route destination',
    apply: (d) => edit(d, 'app/api/you/details/route.ts', "const DEST = '/app/you/settings';", "\nconst DEST = '/app/you/settings';"),
  },
  {
    name: 'the Settings blurb is reworded without moving a control',
    apply: (d) => edit(d, 'app/app/you/settings/page.tsx', 'What your invoices are made out from, and what we call you.',
      'What your invoices are made out from, and what we call you here.'),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${cOk}/${CONTROLS.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);
