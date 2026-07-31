import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../../lib/ratelimit';
import { sessionUser } from '../../../../lib/webauth';
import { readNudgePrefs, setNudgePrefs } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// HIS SWITCHES. The daily reminder and the weekly summary, turned on or off from /app/you/settings.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE FIELD CHANGES AND THE OTHER MUST NOT MOVE, AND THAT IS THE WHOLE DIFFICULTY HERE.
//
// setNudgePrefs writes BOTH columns, because it is the same upsert the WhatsApp STOP handler
// uses and STOP means both. A settings page flips one switch at a time, so this route reads the
// row first and carries the untouched field across.
//
// 🔴 AND THE READ MUST BE ABLE TO SAY "I COULD NOT READ". readNudgePrefs keeps 'none' (no row,
// which honestly means the defaults) apart from null (the read failed). Merging over a failed
// read would fill the untouched field with a DEFAULT, and the default is on, so a database
// wobble would quietly turn a man's old opt out back on. Under PECR an opt out has to be
// honoured, so an unreadable answer refuses the save and says so, rather than guessing.
//
// ⚠️ 'false' IS A TRUTHY STRING. A form posts strings, so the value is compared to the literal
// 'on', never read as a boolean. The same lesson /api/personal learned in production.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function back(req: NextRequest, code: string) {
  const key = code === 'saved' ? 'done' : 'e';
  return NextResponse.redirect(new URL(`/app/you/settings?${key}=${code}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/you/settings', req.url), 303);

  if (await userBurst('you-settings', user.id)) return back(req, 'slow');

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'unavailable');

  // Which switch, and which way. Only the two switches this page owns; anything else is refused
  // rather than guessed at, because a write to a preferences row is a promise about what we will
  // and will not send a man.
  const which = String(form.get('which') ?? '');
  const to = String(form.get('to') ?? '') === 'on';
  if (which !== 'daily_nudges' && which !== 'weekly_summary') return back(req, 'unavailable');

  const current = await readNudgePrefs(user.id);
  if (current === null) return back(req, 'unavailable');
  const base = current === 'none' ? { daily_nudges: true, weekly_summary: true } : current;

  const ok = await setNudgePrefs(user.id, { ...base, [which]: to });
  if (!ok) return back(req, 'unavailable');

  // 303, so a refresh cannot flip the switch again.
  return back(req, 'saved');
}
