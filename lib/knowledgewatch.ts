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

  // ⚠️ THE DIFFER'S HEARTBEAT, AND EVERY GREEN LIGHT ON THIS SYSTEM NOW DEPENDS ON IT.
  //
  // Read the three fields above again and notice what they have in common: every one of them is
  // evidence of a PROBLEM. openDrift, openBlind, and a knowledge_items row from the feed watcher.
  // There was nothing here that was evidence of the differ WORKING, because a differ that finds
  // nothing wrong writes nothing at all.
  //
  // So the differ could have died on a Tuesday, the feed watcher carried on ingesting GOV.UK all
  // week, newestItemAt stayed fresh, no incident row ever appeared, and knowledgeStatus() would
  // have returned 'ok' every morning. Green. Meaning: nobody has checked a single one of our tax
  // constants since Monday, and nothing anywhere knows that.
  //
  // That is not a theory. It is exactly the shape of the five-day death in July, in which a job
  // exited 0 having written nothing and every downstream check read the silence as health.
  //
  // The differ now writes a row to khoji_runs EVERY RUN, pass or fail. So this field is the ONLY
  // thing on the page that is positive evidence, and if it goes stale the light goes red on its
  // own. NOT KNOWING IS NOT THE SAME AS BEING FINE.
  lastDifferRunAt: string | null;
}

// How long the brain may be quiet before it is a problem (docs/105, K5).
export const MAX_QUIET_HOURS_CAPTURE = 48;   // it runs daily; two missed days is a fault
export const MAX_QUIET_DAYS_REVIEW = 14;     // nothing approved in a fortnight is a stalled queue

// The differ runs nightly. 36 hours is one missed night plus most of a day of slack, so a single
// late run is not an alarm and a job that has actually stopped is caught the same day.
export const MAX_QUIET_HOURS_DIFFER = 36;

export interface KnowledgeAlarm {
  reason:
    | 'engine_drift'
    | 'cannot_check'
    | 'not_learning'
    | 'nothing_reviewed'
    | 'never_run'
    // NOBODY IS CHECKING. The differ has not run. We are not saying our constants are wrong. We are
    // saying we do not know, which is the more dangerous of the two, because it feels like nothing.
    | 'differ_dead';
  detail: string;
}

// Empty array means all is well, and here that means something: every constant we hold was
// compared to its primary GOV.UK page and matched.
export function knowledgeAlarms(s: KnowledgeState, now: Date = new Date()): KnowledgeAlarm[] {
  const out: KnowledgeAlarm[] = [];

  // 0. NOBODY IS CHECKING. This is FIRST, ahead of drift, and the order is the argument.
  //
  //    "We found no drift" and "nothing has looked for drift since Monday" produce an identical
  //    database: no incident rows. They are opposite facts. One says our tax engine agrees with
  //    GOV.UK. The other says we have not the faintest idea whether it does, and every quarterly
  //    summary we send in the meantime is signed by a man who trusts us.
  //
  //    An empty incident table is only good news if something was looking. So we check that FIRST,
  //    and everything below it is only meaningful because this passed.
  if (!s.lastDifferRunAt) {
    out.push({
      reason: 'differ_dead',
      detail: 'the differ has NEVER recorded a run: no constant has been compared to GOV.UK',
    });
  } else {
    const hours = (now.getTime() - new Date(s.lastDifferRunAt).getTime()) / 3_600_000;
    if (hours > MAX_QUIET_HOURS_DIFFER) {
      out.push({
        reason: 'differ_dead',
        detail:
          `nothing has checked our tax constants against GOV.UK for ${Math.round(hours)}h ` +
          `(ceiling ${MAX_QUIET_HOURS_DIFFER}h). We are not saying we are wrong. We are saying nobody is looking.`,
      });
    }
  }

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

  // 3. THE KNOWLEDGE FEED. `never_run` (the table is EMPTY) is always an alarm. But a merely STALE
  //    feed — new rows have stopped arriving — is where the old logic cried wolf, and crying wolf on
  //    the one screen the CEO must trust is its own kind of failure.
  //
  //    "No new knowledge in 48h" and "the brain has stopped" are different facts. GOV.UK does not
  //    change its tax pages every day; on a quiet week the capture watcher runs perfectly and ingests
  //    nothing because there is nothing to ingest. Meanwhile the differ has just compared every
  //    constant to GOV.UK and they all agree. Painting that red — "your engine disagrees with GOV.UK"
  //    — while the engine has been positively confirmed correct, teaches the reader to ignore the
  //    light, which is exactly how the five-day death went unnoticed.
  //
  //    So a stale feed is a fault ONLY WHEN THE BRAIN HAS ALSO GONE QUIET, i.e. the differ heartbeat
  //    above is stale. Every watcher runs together in the nightly job, so a fresh differ is positive
  //    proof the capture watcher ran too. If the whole job dies, the differ goes stale and
  //    `differ_dead` fires — the loud alarm — so a real death is never hidden, it just gets the
  //    louder, more accurate word.
  if (!s.newestItemAt) {
    out.push({ reason: 'never_run', detail: 'knowledge_items is empty: the watcher has never written a row' });
  } else {
    const feedHours = (now.getTime() - new Date(s.newestItemAt).getTime()) / 3_600_000;
    const differFresh =
      !!s.lastDifferRunAt &&
      (now.getTime() - new Date(s.lastDifferRunAt).getTime()) / 3_600_000 <= MAX_QUIET_HOURS_DIFFER;
    if (feedHours > MAX_QUIET_HOURS_CAPTURE && !differFresh) {
      out.push({
        reason: 'not_learning',
        detail:
          `no new knowledge for ${Math.round(feedHours)}h (ceiling ${MAX_QUIET_HOURS_CAPTURE}h) ` +
          `AND the brain is not running — the capture watcher has stopped, not just gone quiet`,
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
export function knowledgeStatus(
  alarms: KnowledgeAlarm[],
): 'ok' | 'drift' | 'blind' | 'unwatched' | 'stale' {
  if (alarms.some((a) => a.reason === 'engine_drift')) return 'drift';
  if (alarms.some((a) => a.reason === 'cannot_check')) return 'blind';

  // ⚠️ ABOVE 'stale', AND IT IS NOT A JUDGEMENT CALL.
  //
  // 'stale' means the brain has not learned anything new lately, which is a shrug. 'unwatched'
  // means NOTHING HAS CHECKED WHETHER OUR TAX ENGINE IS RIGHT, which is the condition under which
  // every other green light on this page becomes meaningless. It must not be filed under the same
  // word as a quiet week.
  if (alarms.some((a) => a.reason === 'differ_dead')) return 'unwatched';

  if (alarms.length) return 'stale';

  // AND ONLY NOW does 'ok' mean what it says: something looked, recently, and every constant it
  // could read agreed with GOV.UK.
  return 'ok';
}
