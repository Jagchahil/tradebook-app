// SABOTAGE THE RUN 2 PACKET. Every guard has to be load bearing, and the only proof is breaking it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A green suite proves the code passes the suite. It does not prove the suite would notice the bug
// coming back. So each sabotage below reintroduces ONE of the nineteen findings, on a scratch copy
// of the repo, and the suite has to go red. A sabotage that stays green is a hole in the suite.
//
// The four disciplines this repo has learned, applied throughout:
//   1. ANCHOR ON THE CALL, not the import. An import is not a wiring.
//   2. KILL EVERY CALL SITE, or the sabotage is a no-op and the green is meaningless.
//   3. ANCHOR THE ASSIGNMENT, not the identifier, so a rename does not silently miss.
//   4. NO-OP CONTROLS. A few edits that change nothing must stay GREEN, or the runner is just
//      detecting that the file was touched.
//
//   node test/sabotage-run2.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// One scratch copy per sabotage. node_modules is not needed: the suite imports only lib files.
function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-run2-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/run2fixes.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    // A non-zero exit is red, which is exactly what a sabotage should produce.
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 80)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── F14 / F9: the VAT figure ──────────────────────────────────────────────────────────────
  {
    name: 'F14 rent is counted as taxable turnover',
    apply: (d) => edit(d, 'lib/vatstanding.ts',
      "return String(row.income_type ?? '').toLowerCase() !== 'property';",
      'return true;'),
  },
  {
    name: 'F14 the rolling window is the tax year, not twelve months',
    apply: (d) => edit(d, 'lib/vatstanding.ts',
      'export const ROLLING_WINDOW_DAYS = 365;',
      'export const ROLLING_WINDOW_DAYS = 128;'),
  },
  {
    name: 'F9 a short history goes back to silence instead of a floor',
    apply: (d) => edit(d, 'lib/vatstanding.ts',
      "    : { kind: 'floor', rolling12m, spanDays, distance, over, nearLine };",
      "    : { kind: 'nothing' };"),
  },
  {
    name: 'F14 costs are netted off, so the test runs on profit',
    apply: (d) => edit(d, 'lib/vatstanding.ts',
      '    if (amt > 0) {\n      total += amt;\n      counted += 1;\n    }',
      '    total += amt;\n    counted += 1;'),
  },
  {
    name: 'F14 the WhatsApp VAT lane is removed',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      // ⚠️ ANCHOR REPAIRED 17 August 2026. It read `handleVatQuestion(from)` until B18 collapsed that
      // handler to four lines and gave it the message text, so BOTH F14 anchors in this file could no
      // longer be applied and this suite's two WhatsApp VAT lane guards went UNPROVEN rather than
      // broken. Found by the full eighteen pass loop on the Mac, which is the only thing that can see
      // it: nothing in Cowork runs the whole loop. FOURTH broken anchor from that one refactor.
      '          } else if (isVatQuestion(text)) {\n            await handleVatQuestion(from, text);',
      '          } else if (false) {\n            await handleVatQuestion(from, text);'),
  },
  {
    // ⚠️ THE SABOTAGE HAS TO BE A REAL REGRESSION. An earlier version of this moved the lane to
    // sit immediately above matchTotalsQuestion, which is still ABOVE everything that would
    // swallow a VAT question, so the behaviour was unchanged and the suite was right to stay
    // green. The genuine regression is dropping it BELOW the open question lane, where a VAT
    // question reaches handleMoneyQuestion and the deterministic answer never runs.
    name: 'F14 the VAT lane drops below the open question lane',
    apply: (d) => {
      const p = path.join(d, 'app/api/whatsapp/route.ts');
      let s = readFileSync(p, 'utf8');
      const lane = '          } else if (isVatQuestion(text)) {\n            await handleVatQuestion(from, text);\n';
      if (!s.includes(lane)) throw new Error('ANCHOR MISSING: vat lane');
      s = s.replace(lane, '');
      const below = '          } else if (isVent(text)) {';
      if (!s.includes(below)) throw new Error('ANCHOR MISSING: floor');
      s = s.replace(below, `${lane}${below}`);
      writeFileSync(p, s);
    },
  },
  {
    name: 'F9 the VAT page goes back to the account age gate',
    apply: (d) => edit(d, 'app/app/tax/vat/page.tsx',
      '      .then((rows) => vatStanding(rows, to, VAT_REGISTRATION_THRESHOLD, false))',
      '      .then(() => null)'),
  },

  // ── F8: the overdue quarterly update ──────────────────────────────────────────────────────
  {
    name: 'F8 a passed due date reads as history again',
    apply: (d) => edit(d, 'lib/mtdupdates.ts',
      "    else state = 'overdue';",
      "    else state = 'open';"),
  },
  {
    name: 'F8 the due dates drift to the quarter ends',
    apply: (d) => edit(d, 'lib/mtdupdates.ts',
      'due: iso(startYear, 8, 7) },',
      'due: iso(startYear, 7, 5) },'),
  },
  {
    name: 'F8 the quarter boundaries are back formed from the due dates',
    apply: (d) => edit(d, 'lib/mtdupdates.ts',
      "{ index: 1, start: iso(startYear, 4, 6), end: iso(startYear, 7, 5),",
      "{ index: 1, start: iso(startYear, 5, 1), end: iso(startYear, 8, 7),"),
  },
  {
    name: 'F8 the easement travels without the return gate',
    apply: (d) => edit(d, 'lib/mtdupdates.ts',
      "  + 'not mattering: every update for the year has to be in before the return for that year can be '\n  + 'filed, so a missed one is put off rather than written off.';",
      "  + 'anything to worry about.';"),
  },
  {
    name: 'F8 the overdue sentence asserts she did not send it',
    apply: (d) => edit(d, 'lib/mtdupdates.ts',
      'and I have no record of it going.`',
      'and you have not sent it.`'),
  },
  {
    name: 'F8 the quarterly page stops drawing the missed update',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      '  const overdue = mandated ? overdueUpdate(now.toISOString().slice(0, 10), startYear, index) : null;',
      '  const overdue = null;'),
  },
  {
    name: 'F8 the page overdue function returns nothing',
    apply: (d) => edit(d, 'app/app/tax/due.ts',
      '  if (todayIso <= dueISO) return null;',
      '  if (true) return null;'),
  },

  // ── F5 / F7: the property stream ──────────────────────────────────────────────────────────
  {
    name: 'F7 mortgage interest routes back to the trade stream',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      "export const PROPERTY_CATEGORIES = [\n  'mortgage interest',",
      "export const PROPERTY_CATEGORIES = ["),
  },
  {
    name: 'F5 every cost routes to trade again',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      "  return isPropertyCategory(category) ? 'property' : 'trade';",
      "  return 'trade';"),
  },
  {
    name: 'F5 the landlord is offered no property categories',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      '  return hasRentalStream === true;',
      '  return false;'),
  },
  {
    name: 'F5 the plumber is shown property categories too',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      '  if (!offerPropertyCategories(hasRentalStream)) return [...trade];',
      '  if (false) return [...trade];'),
  },
  {
    name: 'F7 the pile files a property cost through the trade door',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      '  const applied = isPropertyCategory(category)\n    ? await confirmPileProperty(user.id, ids, category)\n    : await confirmPile(user.id, ids, category);',
      '  const applied = await confirmPile(user.id, ids, category);'),
  },
  {
    name: 'F7 the migration stops setting the property stream',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_property_expense_stream.sql',
      "     set category    = v_cat,\n         income_type = 'property',",
      '     set category    = v_cat,'),
  },
  {
    name: 'F7 the SQL allowlist drifts from the TS list',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_property_expense_stream.sql',
      "'mortgage interest', 'letting agent', 'property repairs', 'ground rent'",
      "'mortgage interest'"),
  },
  {
    name: 'F7 the migration loses its money guard',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_property_expense_stream.sql',
      '     and t.amount < 0                -- money out only, exactly as confirm_pile',
      '     and t.amount < 999999            -- guard removed'),
  },
  {
    name: 'F5 a property category is dropped from the one category list',
    apply: (d) => edit(d, 'lib/categories.ts', "  'ground rent',\n", ''),
  },

  // ── F3: machine read amounts ──────────────────────────────────────────────────────────────
  {
    name: 'F3 a photograph rejoins the bank rows in one group',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      "    const id = `${kind}:${read ? 'read' : 'given'}${unsure ? ':unsure' : ''}:${key}`;",
      "    const id = `${kind}${unsure ? ':unsure' : ''}:${key}`;"),
  },
  {
    name: 'F3 a bank line is treated as machine read',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      "export const MACHINE_READ_SOURCES = ['whatsapp_image', 'web_image'] as const;",
      "export const MACHINE_READ_SOURCES = ['whatsapp_image', 'web_image', 'bank_feed'] as const;"),
  },
  {
    name: 'F3 the group forgets it came off a photograph',
    apply: (d) => edit(d, 'lib/reviewpile.ts', '      readFromPhoto: read,', '      readFromPhoto: false,'),
  },
  {
    name: 'F3 the server files both lists on one press',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      '        .filter((g) => g.readFromPhoto === wantRead && g.uncertainAmount === wantUnsure),',
      '        .filter((g) => g.uncertainAmount === wantUnsure),'),
  },
  {
    name: 'F3 the pile stops selecting the source column',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'cis_deduction,source_type,confidence_score`',
      'cis_deduction,confidence_score`'),
  },
  {
    name: 'F3 the screen merges the two confident lists again',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      '  const knownRead = known.filter((g) => g.readFromPhoto && !g.uncertainAmount);',
      '  const knownRead = known.filter((g) => !g.uncertainAmount);'),
  },

  // ── F4 / F13: dedupe ──────────────────────────────────────────────────────────────────────
  {
    name: 'F4 the statement walk stops looking sideways at receipts',
    apply: (d) => edit(d, 'lib/statementingest.ts',
      '      const capturedSince = new Date(Date.now() - 90 * 86400_000).toISOString();',
      '      const capturedSince = new Date(Date.now()).toISOString();\n      if (true) throw new Error("skip");'),
  },
  {
    name: 'F4 a merge no longer needs to be confident',
    apply: (d) => edit(d, 'lib/statementingest.ts',
      "          if (hit && hit.strength === 'same') {",
      '          if (hit) {'),
  },
  {
    name: 'F4 the superseded receipt is left in the books',
    apply: (d) => edit(d, 'lib/statementingest.ts',
      '          mergedWithReceipts = await dropSupersededReceipts(userId, [...claimed]);',
      '          mergedWithReceipts = 0;'),
  },
  {
    name: 'F4 one receipt can be claimed by many bank lines',
    apply: (d) => edit(d, 'lib/statementingest.ts',
      '            waiting.filter((w) => !claimed.has(String(w.id))),',
      '            waiting,'),
  },
  {
    name: 'F13 the twin check goes back to the printed date window',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      '    const capturedRows = (await recentlyCapturedForMatch(userId, capturedSince)).filter(',
      '    const capturedRows = recent.filter('),
  },
  {
    name: 'F13 the arrival window reader filters on the printed date',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '      `&created_at=gte.${encodeURIComponent(sinceISO)}` +',
      '      `&transaction_date=gte.${encodeURIComponent(sinceISO)}` +'),
  },
  {
    name: 'F4 the drop reaches confirmed rows',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "        `&confirmed=eq.false` +\n        `&id=in.(${clean.join(',')})`,",
      "        `&id=in.(${clean.join(',')})`,"),
  },

  // ── F15 / F20 / F19 / F21 / F17 / F16: the routers ────────────────────────────────────────
  {
    name: 'F15 the correction lead in narrows back to "no,"',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "const EDIT_LEAD_IN = '(?:no,?\\\\s*|actually,?\\\\s*|sorry,?\\\\s*|oh,?\\\\s*|wait,?\\\\s*|hang on,?\\\\s*|hold on,?\\\\s*)*';",
      "const EDIT_LEAD_IN = '(?:no,?\\\\s*)?';"),
  },
  {
    name: 'F15 a new entry is swallowed as an edit',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "    t.match(new RegExp(`^${EDIT_LEAD_IN}(?:change|make|edit|correct)\\\\s+(?:that|it|the last one)\\\\s*(?:to|was)?\\\\s*${AMOUNT}\\\\b.*$`, 'i'))",
      "    t.match(new RegExp(`^.*?${AMOUNT}\\\\b.*$`, 'i'))"),
  },
  {
    name: 'F20 half seven goes back to being half to seven',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '      return h === null ? whole : `${h}:30`;',
      '      return h === null ? whole : `${h - 1}:30`;'),
  },
  {
    name: 'F20 the rewrite stops happening before the model sees it',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      'const parsed = await parseSchedule(normaliseBritishTime(body), new Date().toISOString());',
      'const parsed = await parseSchedule(body, new Date().toISOString());'),
  },
  {
    name: 'F19 an invoice request is treated as income again',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "    'That is money you are owed, not money you have, so nothing has gone into your figures and '\n    + 'nothing will until it is actually paid.',",
      "    'Logged.',"),
  },
  {
    name: 'F19 the invoice lane drops below the money lanes',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      '          } else if (matchInvoiceDraft(text) !== null) {\n            await handleInvoiceDraft(from, text);',
      '          } else if (false) {\n            await handleInvoiceDraft(from, text);'),
  },
  {
    name: 'F21 the barber question reaches her own figures',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '  return /\\bowe|owes|owed|earn|earns|made|makes|turnover|profit|tax|takings|books|figures|pay|pays\\b/i.test(b);',
      '  return false;'),
  },
  {
    name: 'F21 the refusal lane is removed from the router',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      '          } else if (isAboutSomeoneElse(text)) {\n            await sendText(from, SOMEONE_ELSE_ANSWER);',
      '          } else if (false) {\n            await sendText(from, SOMEONE_ELSE_ANSWER);'),
  },
  {
    name: 'F17 the language apology refuses the person again',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "    + 'going to guess at one in a language I cannot check. Here it is in English, and I am sorry '\n    + 'about that.';",
      "    + 'That question is not about your UK tax. Ask me again in English.';"),
  },
  {
    name: 'F17 Punjabi stops being recognised',
    apply: (d) => edit(d, 'lib/waintents.ts', "  [/[਀-੿]/, 'Punjabi'],\n", ''),
  },
  {
    name: 'F16 a message with no digits is an attempted money entry again',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "  if (!/\\d/.test(b)) return false;",
      '  return true;'),
  },
  {
    name: 'F16 the floor is removed and everything falls to the entry parser',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      '          } else if (!looksLikeMoneyEntry(text)) {\n            await handleMoneyQuestion(from, text);',
      '          } else if (false) {\n            await handleMoneyQuestion(from, text);'),
  },
  {
    name: 'F16 a vent is parsed as a reminder again',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '  if (b.length < 300) return false;',
      '  return false;'),
  },
];

// ⚠️ NO-OP CONTROLS. These change the files without changing behaviour, and MUST stay green. If a
// control goes red the runner is detecting that a file was edited, not that a guard was broken.
const CONTROLS = [
  {
    name: 'control: a comment is reworded',
    apply: (d) => edit(d, 'lib/vatstanding.ts', '// The two statutory tests, in the order a customer meets them.', '// Two tests.'),
  },
  {
    name: 'control: whitespace in the migration',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-13_property_expense_stream.sql', '-- ============================================================================\n-- Verify.', '--\n-- Verify.'),
  },
  {
    name: 'control: a local variable is renamed',
    apply: (d) => edit(d, 'lib/mtdupdates.ts', 'const today = String(nowISO).slice(0, 10);', 'const todayDay = String(nowISO).slice(0, 10);\n  const today = todayDay;'),
  },
];

console.log('BASELINE');
{
  const dir = scratch();
  const r = runSuite(dir);
  console.log(r.red ? '  FAIL baseline is already red' : '  ok  baseline is green');
  if (r.red) {
    console.log(r.out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 10).join('\n'));
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
}

let caught = 0;
let missed = 0;
console.log('\nSABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try {
    s.apply(dir);
  } catch (e) {
    console.log(`  MISSED ${s.name}  [${e.message}]`);
    missed += 1;
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  const r = runSuite(dir);
  if (r.red) {
    caught += 1;
    console.log(`  ok  ${s.name}`);
  } else {
    missed += 1;
    console.log(`  MISSED ${s.name}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

let controlsOk = 0;
let controlsBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try {
    c.apply(dir);
  } catch (e) {
    console.log(`  BAD ${c.name}  [${e.message}]`);
    controlsBad += 1;
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  const r = runSuite(dir);
  if (r.red) {
    controlsBad += 1;
    console.log(`  BAD ${c.name} went red`);
  } else {
    controlsOk += 1;
    console.log(`  ok  ${c.name}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

const total = SABOTAGES.length + CONTROLS.length;
const good = caught + controlsOk;
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${controlsOk}/${CONTROLS.length} controls green.`);
console.log(`${good} of ${total}.`);
if (missed > 0 || controlsBad > 0) process.exit(1);
