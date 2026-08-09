// NOBODY IS EVER TOLD TO GO AND OPEN AN OPENAI ACCOUNT AGAIN.
//
//   node test/noopenai.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT: THE CODE WAS FIXED IN JULY AND EIGHTEEN DOCUMENTS WENT ON GIVING THE OLD ORDER.
//
// lib/transcribe.ts uploaded customer voice notes to the OpenAI Whisper API. It was deleted on
// 26 July 2026 when transcription moved onto our own Mac mini, and test/hardening.test.mjs has
// guarded the CODE ever since: no api.openai.com, no OPENAI_API_KEY read anywhere in app/ or lib/.
//
// 🔴 NOTHING GUARDED THE INSTRUCTIONS. Two weeks later the go live runbook still had a numbered
// section headed "Switch on voice notes (OpenAI Whisper)" whose first step was "go to
// platform.openai.com, add a little credit, create an API key". The master action checklist had an
// unticked box for it. The launch gates runbook had it as step 3. And there was a row sitting on
// the TEAM CONSOLE, seeded into team_todos, reading "Paste the OpenAI key into Vercel and redeploy,
// to switch voice notes on."
//
// A guard on the code and no guard on the runbook is a guard on the one half nobody was going to
// get wrong. The founder does not edit lib/. He opens the runbook on launch day and does what it
// says, and what it said would have:
//
//   1. Cost money for credit on a key that no line of code reads.
//   2. Put the company into a contract with a processor that processes nothing of ours.
//   3. Pointed straight at the one architecture that makes the PRIVACY POLICY FALSE. It promises
//      "your voice notes never leave our systems" and "no third party ever hears your voice note".
//   4. Wasted an hour on launch day wondering why voice still did not work, because the thing that
//      actually switches it on is the Mac mini being awake.
//
// ⚠️ WHISPER IS NOT OPENAI-THE-PROCESSOR, and that distinction is the whole answer rather than a
// technicality. Whisper is open weights under an MIT licence. Running it on hardware we own is
// using open source software, like running Postgres: no account, no call, no data leaving, so no
// controller to processor relationship, no DPA, and nothing owed in the data inventory. Anthropic
// is the only AI processor Lekhio has. This file exists so that stays written down somewhere that
// fails the build rather than somewhere that can quietly go stale.
//
// ⚠️ AND WISPR FLOW IS A DIFFERENT COMPANY AND A DIFFERENT ANSWER. It is cloud only: audio leaves
// the device for their servers. It is fine as a dictation tool on a personal machine and it must
// never become the product's transcription path, because it would break both privacy sentences and
// add a processor we would owe a DPA to.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ── 1. THE CODE. hardening.test.mjs owns this, and it is restated here so this file is a complete
//       statement of the position rather than half of one. ────────────────────────────────────────
console.log('\nThe code calls nothing and reads no key.\n');
{
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(root, 'lib'));
  walk(path.join(root, 'app'));
  ok('🔴 THE SWEEP FOUND FILES, without which every assertion below is vacuous', files.length > 100);

  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const line of src.split('\n')) {
      // ⚠️ COMMENTS ARE SKIPPED DELIBERATELY. Several files explain at length WHY there is no
      // OpenAI call, and a guard that punishes the explanation teaches people to delete it.
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (/process\.env\.OPENAI_API_KEY/.test(line) || /['"`]https:\/\/api\.openai\.com/.test(line)) {
        offenders.push(`${path.relative(root, f)}: ${t.slice(0, 70)}`);
      }
    }
  }
  ok(`🔴 NO OPENAI KEY READ AND NO OPENAI ENDPOINT IN app/ OR lib/${offenders.length ? `\n     ${offenders.join('\n     ')}` : ''}`,
    offenders.length === 0);

  let gone = false;
  try { readFileSync(path.join(root, 'lib/transcribe.ts'), 'utf8'); } catch { gone = true; }
  ok('🔴 lib/transcribe.ts IS STILL DELETED. It was complete and working and needed only a key.',
    gone);
}

// ── 2. THE INSTRUCTIONS. The half that was not guarded. ──────────────────────────────────────────
console.log('\nAnd no document tells a human to go and set one up.\n');
{
  const docs = [];
  const walkDocs = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkDocs(full);
      else if (/\.(md|sql)$/.test(e.name)) docs.push(full);
    }
  };
  walkDocs(path.join(root, 'docs'));
  walkDocs(path.join(root, 'supabase'));
  try { docs.push(path.join(root, 'CLAUDE.md')); } catch { /* optional */ }
  ok('the doc sweep found files', docs.length > 20);

  // 🔴 AN INSTRUCTION, NOT A MENTION. The docs are allowed and expected to discuss OpenAI at
  // length: the correction notes do, the privacy reasoning does, and a guard that forbade the word
  // would delete the very explanations that stop somebody re-adding it next month. What is banned
  // is the IMPERATIVE: go to this site, create this key, set this variable, add this credit.
  const IMPERATIVES = [
    /(?:go to|visit|open)\s+(?:https?:\/\/)?platform\.openai\.com/i,
    // ⚠️ "the" AND "paste" ARE IN HERE BECAUSE THE SELF TEST DEMANDED THEM. The team_todos row read
    // "Paste the OpenAI key into Vercel", and a pattern written to catch "create an OpenAI key"
    // walked straight past the one instruction that was sitting on a screen the founder opens daily.
    /(?:add|create|generate|get|paste|set|put)\s+(?:an?\s+|the\s+|your\s+)?openai\s+(?:api\s+)?key/i,
    /(?:add|top up|put)\s+[^.\n]{0,40}openai[^.\n]{0,40}credit/i,
    /(?:^|[\s>])(?:set|add|paste|put)\s+`?OPENAI_API_KEY`?\s+(?:in|into|to)\b/i,
    // ⚠️ THIS FIFTH PATTERN EXISTS BECAUSE THE SELF TEST BELOW WENT RED WITHOUT IT, on a sentence
    // that was live in docs/24 that morning: "OpenAI Whisper (optional, for voice): add credit and
    // the key." The four above all expect the word OpenAI to follow the verb, and here it LEADS.
    // Four patterns written from memory caught three of the four real sentences. The self test is
    // the only reason that is known rather than assumed.
    /openai[^.\n]{0,60}\b(?:add|create|paste|set)\b[^.\n]{0,30}\b(?:credit|key)\b/i,
  ];

  const offenders = [];
  for (const d of docs) {
    let src;
    try { src = readFileSync(d, 'utf8'); } catch { continue; }
    for (const [n, line] of src.split('\n').entries()) {
      // ⚠️ A STRUCK OUT OR EXPLICITLY CANCELLED INSTRUCTION IS NOT AN INSTRUCTION. Every one of
      // these was corrected in place rather than deleted, so the next reader can see what the old
      // order was and why it was wrong. Deleting them would make this exact mistake repeatable by
      // anybody who finds an old copy. So a line carrying the stop mark, a strikethrough, or a
      // cancelling word is allowed to quote the thing it is cancelling.
      if (/🛑|~~|obsolete|do not do this|must not be followed|used to (?:say|read)|not needed/i.test(line)) continue;
      if (line.trim().startsWith('--')) continue; // a SQL comment explaining a corrected seed row
      for (const re of IMPERATIVES) {
        if (re.test(line)) {
          offenders.push(`${path.relative(root, d)}:${n + 1}  ${line.trim().slice(0, 80)}`);
          break;
        }
      }
    }
  }
  ok(`🔴 NO LIVE INSTRUCTION TO CREATE AN OPENAI ACCOUNT, KEY OR CREDIT${offenders.length ? `\n     ${offenders.join('\n     ')}` : ''}`,
    offenders.length === 0);

  // ⚠️ THE DETECTOR PROVES ITSELF, because a pattern that matches nothing passes this file for ever
  // and would pass the real tree too. Three of these are the exact sentences that were live in the
  // repo on the morning of 9 August 2026.
  const hits = (s) => IMPERATIVES.some((re) => re.test(s));
  ok('the detector catches every sentence that was actually live in the repo',
    hits('1. Go to platform.openai.com, add a little credit, create an API key.')
    && hits('3. Set `OPENAI_API_KEY` in Vercel with a little credit, for Whisper voice transcription.')
    && hits('Paste the OpenAI key into Vercel and redeploy, to switch voice notes on.')
    && hits('- [ ] OpenAI Whisper (optional, for voice): add credit and the key.'));
  ok('🔴 AND IT LETS THE EXPLANATIONS THROUGH, or the reasoning gets deleted to make it green',
    !hits('OpenAI is not a processor of ours and never was.')
    && !hits('Whisper is MIT licensed open weights, so running it on our own hardware adds no processor.')
    && !hits('The data inventory named OpenAI as a processor and we have never had one.'));
}

// ── 3. THE POSITION, WRITTEN WHERE THE PAPERWORK IS READ FROM. ───────────────────────────────────
console.log('\nThe inventory and the policy say the same thing as the code.\n');
{
  const inv = readFileSync(path.join(root, 'docs/14_DATA_INVENTORY.md'), 'utf8');
  const processors = inv.slice(inv.indexOf('## Who we share it with'), inv.indexOf('## Where data lives'));
  ok('🔴 OPENAI IS NOT IN THE PROCESSOR TABLE',
    !/^\| OpenAI/m.test(processors));
  ok('and Anthropic still is, because that one is real',
    /\| Anthropic/.test(processors));
  ok('the correction is recorded rather than quietly deleted, so nobody re-adds it',
    /never has been|is not a processor of ours/i.test(inv) && /Mac mini/.test(inv));

  // ⚠️ WHITESPACE IS FLATTENED FIRST, AND THAT IS NOT A DETAIL. JSX prose wraps at the print
  // margin, so "No third party ever hears your voice note" is split across two lines with eight
  // spaces of indentation in the middle of it. The first version of this assertion matched the
  // literal sentence and went red against a policy that says exactly the right thing. A guard that
  // fails on correct code is a guard somebody weakens, and the weakening is what lets the real one
  // through later.
  const policy = readFileSync(path.join(root, 'app/privacy/page.tsx'), 'utf8');
  const flat = policy.replace(/\s+/g, ' ');
  ok('🔴 THE PUBLIC POLICY STILL PROMISES THE AUDIO STAYS HERE',
    /never leave our systems/i.test(flat) && !/OpenAI/.test(policy));
  ok('and it promises no third party hears it, the sentence any cloud transcriber would break',
    /no third party ever hears your voice note/i.test(flat));
  ok('and that we run it on our own hardware, which is the claim the Mac mini has to keep true',
    /we run the transcription on our own hardware/i.test(flat));

  // The reaper is what keeps the second half of that promise true when the mini is off.
  const watch = readFileSync(path.join(root, 'lib/cronwatch.ts'), 'utf8');
  ok('🔴 AND THE REAPER THAT WIPES THE AUDIO IS WATCHED, or the promise rots in silence',
    /voicereap:\s*\d+/.test(watch));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
