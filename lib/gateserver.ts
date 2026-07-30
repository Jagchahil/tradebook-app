// lib/gateserver.ts. READING THE GATE, AND REFUSING IN THE RIGHT LANGUAGE.
//
// lib/gate.ts is the rule and the table, and it is pure so a test can attack it. This is the thin
// server side that reads a man's subscription, asks that rule what it means, and turns a refusal
// into whatever the caller can actually understand.
//
// ⚠️ IT IS ITS OWN FILE RATHER THAN PART OF lib/webauth.ts ON PURPOSE. webauth answers WHO he is.
// This answers WHAT HE MAY DO. They are different questions with different failure modes, and the
// day somebody weakens one it must not quietly weaken the other.

import { NextRequest, NextResponse } from 'next/server';
import { readGateInputs } from './supabase';
import { isEntitled, TRIAL_DAYS } from './entitlement';
import { gateFor, readonlyPayload, type Gate } from './gate';

// The gate for one account, right now.
//
// 🔴 IT NEVER THROWS AND IT NEVER RETURNS 'readonly' BECAUSE SOMETHING BROKE. readGateInputs
// reports an unreadable subscription as its own kind, distinct from the man simply not having one,
// and gateFor opens the door on the first and judges only the second. A caller that turned an
// exception into a lock would undo that in one line, so there is nothing here that can throw.
export async function gateForUser(userId: string): Promise<Gate> {
  if (!userId) return 'open';
  try {
    const { read, accountAgeDays } = await readGateInputs(userId);
    const entitled = read.kind === 'read'
      ? isEntitled({ status: read.status, current_period_end: read.current_period_end })
      : false;
    return gateFor(read, entitled, accountAgeDays, TRIAL_DAYS);
  } catch {
    // Our failure, not his entitlement. lib/entitlement.ts's asymmetry: locking a man out of his
    // own records is worse than letting him have another fortnight free.
    return 'open';
  }
}

// ⚠️ A FORM CALLER NEVER SEES JSON. The same rule /api/bank/connect and /api/billing/checkout
// already follow: /app/pile ships no client script, so its buttons are plain form posts, and a man
// pressing Confirm must not be shown an error object. He goes back to the page, which draws the
// read only banner and the one button that fixes it.
//
// Everything else, which is the phone app and any fetch caller, gets 402 Payment Required. That is
// the one status code that means exactly this, and `entitled: false` in the body is what the app
// already reads from /api/billing/status.
export function refuseUnentitled(req: NextRequest, backTo: string): NextResponse {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  if (isForm) {
    return NextResponse.redirect(new URL(`${backTo}?locked=1`, req.url), 303);
  }
  return NextResponse.json(readonlyPayload(), { status: 402 });
}
