// The brain's watchdog. Pure policy, no I/O, so the test runner loads it directly.
//
// THE FAILURE THIS EXISTS TO CATCH, and it is not a hypothetical.
//
// Khoji's launchd job fired into an empty folder from 7 to 12 July 2026 and never ran once. The
// hand-runs that were quietly compensating for it stopped working on 8 July, when a stray letter
// landed on the front of a key in its .env and the watcher started exiting 0 without writing a
// row. The brain was dead for five days, launchd reported success every morning, and NOBODY
// NOTICED, because nothing anywhere was looking.
//
// That is the house disease. Not crashes. SILENCE. The digest cron reached 200 users and returned
// 200 OK. A tested llms.txt was built and never served. Every one of them succeeded at doing
// nothing. So the rule for this file, and it is the whole reason it exists:
//
//   NOT KNOWING IS NOT THE SAME AS BEING FINE.
//
// A brain that has learned nothing for two days is not "quiet". A differ that cannot read a page
// is not "finding no problems". Both are alarms.

export interface KnowledgeState {
  // The most recent row of any kind. If this stops moving, the watcher has stopped.
  newestItemAt: string | null;
  // The most recent REVIEWED row. Only reviewed rows ever reach a user's tax answer, so if this
  // stops moving the brain is collecting and nobody is approving, and it is learning nothing.
  newestReviewedAt: string | null;
  // Open incidents from the differ. A drift means a constant in lib/taxengine.ts disagrees with
  // GOV.UK right now. There is no such thing as a low priority one.
  openDrift: { fact: string; ours: string | number | null; theirs: string | number | null }[];
  // Facts the differ could not read off the page at all. We are not right, we are BLIND.
  openBlind: { fact: string }[];
}

// How long the brain may be quiet before it is a problem (docs/105, K5).
export const MAX_QUIET_HOURS_CAPTURE = 48;   // it runs daily; two missed days is a fault
export const MAX_QUIET_DAYS_REVIEW = 14;     // nothing approved in a fortnight is a stalled queue

export interface KnowledgeAlarm {
  reason: 'engine_drift' | 'cannot_check' | 'not_learning' | 'nothing_reviewed' | 'never_run';
  detail: string;
}

// Empty array means all is well, and here that means something: every constant we hold was
// compared to its primary GOV.UK page and matched.
export function knowledgeAlarms(s: KnowledgeState, now: Date = new Date()): KnowledgeAlarm[] {
  const out: KnowledgeAlarm[] = [];

  // 1. WE ARE WRONG. The loudest thing this system can say, and the only reason it was built.
  for (const d of s.openDrift) {
    out.push({
      reason: 'engine_drift',
      detail: `${d.fact}: GOV.UK says ${d.theirs}, our engine says ${d.ours}`,
    });
  }

  // 2. WE CANNOT TELL whether we are wrong. Deliberately an alarm, not a pass. A differ that
  //    cannot find the number on the page and reports "all clear" is lying by omission, and it
  //    is exactly how the mileage rate sat wrong while a watcher stared at the page every night.
  for (const b of s.openBlind) {
    out.push({
      reason: 'cannot_check',
      detail: `${b.fact}: could not be read off its GOV.UK page, so we do not know if we are right`,
    });
  }

  // 3. The watcher has stopped.
  if (!s.newestItemAt) {
    out.push({ reason: 'never_run', detail: 'knowledge_items is empty: the watcher has never written a row' });
  } else {
    const hours = (now.getTime() - new Date(s.newestItemAt).getTime()) / 3_600_000;
    if (hours > MAX_QUIET_HOURS_CAPTURE) {
      out.push({
        reason: 'not_learning',
        detail: `no new knowledge for ${Math.round(hours)}h, ceiling is ${MAX_QUIET_HOURS_CAPTURE}h`,
      });
    }
  }

  // 4. The queue has stalled. Rows are piling up and nobody is approving them, so nothing new is
  //    reaching Rakha and the brain is, in the only sense that matters to a user, not growing.
  if (s.newestReviewedAt) {
    const days = (now.getTime() - new Date(s.newestReviewedAt).getTime()) / 86_400_000;
    if (days > MAX_QUIET_DAYS_REVIEW) {
      out.push({
        reason: 'nothing_reviewed',
        detail: `nothing approved for ${Math.round(days)} days, ceiling is ${MAX_QUIET_DAYS_REVIEW}`,
      });
    }
  }

  return out;
}

// One word for the public health body. Never the detail: which of our tax constants is currently
// wrong is a useful thing for a stranger to know and no use at all to you, who gets the email
// either way. The detail lives behind the CRON_SECRET bearer, like the rest of it.
export function knowledgeStatus(alarms: KnowledgeAlarm[]): 'ok' | 'drift' | 'blind' | 'stale' {
  if (alarms.some((a) => a.reason === 'engine_drift')) return 'drift';
  if (alarms.some((a) => a.reason === 'cannot_check')) return 'blind';
  if (alarms.length) return 'stale';
  return 'ok';
}
