// scripts/studio-agent.mjs
//
// THE MAC MINI'S DAILY TRIGGER for the Content Studio agent. Thin on purpose.
//
// This script does NOT draft, generate, or post. It calls one endpoint on the deployed app, which
// does the real work with its own keys and config. This machine holds only two things: the shared
// secret and the app URL. That keeps the Mac mini dumb and the secrets on the server, and it means
// this runner is fully isolated from your personal bot: its own launchd label, its own log, its own
// process. Nothing it does can touch the two gates, it only ADDS drafts to awaiting_approval for you
// to review.
//
// USAGE:
//   node scripts/studio-agent.mjs            (drafts the default batch, 3)
//   node scripts/studio-agent.mjs --count 5  (ask for up to 5, the server caps at 5)
//
// Needs, in .env.local or the environment:
//   AGENT_SECRET            must match the same var set on the deployed app (Vercel)
//   NEXT_PUBLIC_APP_URL     e.g. https://lekhio.app  (APP_URL also accepted)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
let count = 3;
const ci = args.indexOf('--count');
if (ci >= 0 && args[ci + 1]) {
  const n = parseInt(args[ci + 1], 10);
  if (Number.isFinite(n)) count = n;
}
const eq = args.find((a) => a.startsWith('--count='));
if (eq) {
  const n = parseInt(eq.split('=')[1], 10);
  if (Number.isFinite(n)) count = n;
}

const APP = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
const SECRET = process.env.AGENT_SECRET;
const stamp = new Date().toISOString();

if (!APP || !SECRET) {
  console.error(`[${stamp}] studio-agent: missing NEXT_PUBLIC_APP_URL or AGENT_SECRET. Nothing sent.`);
  process.exit(2);
}

try {
  const res = await fetch(`${APP}/api/agent/studio-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-secret': SECRET },
    body: JSON.stringify({ count }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[${stamp}] studio-agent: run failed ${res.status} ${text}`);
    process.exit(1);
  }
  console.log(`[${stamp}] studio-agent: ${text}`);
} catch (err) {
  console.error(`[${stamp}] studio-agent: request error ${err?.message || err}`);
  process.exit(1);
}
