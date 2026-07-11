// scripts/send-campaign.mjs
//
// Send a marketing email to the consented list built by the free tools. Safe by
// default: it is a DRY RUN unless you pass --send, and it only ever emails people
// who consented and have not unsubscribed. Every email carries a working, signed
// unsubscribe link and the List-Unsubscribe headers inboxes expect.
//
// USAGE:
//   node scripts/send-campaign.mjs "Your subject line" path/to/body.html
//   node scripts/send-campaign.mjs "Your subject line" path/to/body.html --send
//   ...add --confirmed-only to email only double opt in confirmed contacts
//
// The body file is simple HTML (headings, paragraphs, a link). The footer and the
// unsubscribe line are added automatically. Requires RESEND_API_KEY (and EMAIL_FROM
// with a Resend verified domain) in the environment or .env.local.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.join(ROOT, '.env.local'));
loadEnv(path.join(ROOT, '.env'));

const args = process.argv.slice(2);
const send = args.includes('--send');
const confirmedOnly = args.includes('--confirmed-only');
const positional = args.filter((a) => !a.startsWith('--'));
const subject = positional[0];
const bodyPath = positional[1];

if (!subject || !bodyPath) {
  console.log('Usage: node scripts/send-campaign.mjs "Subject" body.html [--send] [--confirmed-only]');
  process.exit(1);
}
if (!fs.existsSync(bodyPath)) {
  console.error('Body file not found:', bodyPath);
  process.exit(1);
}
const bodyHtml = fs.readFileSync(bodyPath, 'utf8');

const supa = await import(pathToFileURL(path.join(ROOT, 'lib', 'supabase.ts')).href);
const email = await import(pathToFileURL(path.join(ROOT, 'lib', 'email.ts')).href);
const tok = await import(pathToFileURL(path.join(ROOT, 'lib', 'leadtoken.ts')).href);

if (!email.hasEmailConfig()) {
  console.error('RESEND_API_KEY is not set, so no email can be sent. Add it to .env.local first.');
  process.exit(2);
}

const list = await supa.listMarketableLeads(confirmedOnly);
console.log(`Recipients (${confirmedOnly ? 'confirmed only' : 'all consented, not unsubscribed'}): ${list.length}`);
console.log('Subject:', subject);
console.log('Sample:', list.slice(0, 5).join(', ') || '(none)');

if (!send) {
  console.log('\nDRY RUN. Nothing sent. Re-run with --send to actually send.');
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const to of list) {
  const sent = await email.sendMarketingEmail(to, subject, bodyHtml, tok.unsubscribeUrl(to));
  if (sent) ok += 1;
  else fail += 1;
  await new Promise((r) => setTimeout(r, 120)); // gentle throttle
}
console.log(`\nDone. Sent ${ok}, failed ${fail}.`);
process.exitCode = fail && !ok ? 1 : 0;
