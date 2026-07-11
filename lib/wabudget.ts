// DEPRECATED. The WhatsApp send budget moved into lib/margin.ts, the single
// source of truth for unit economics, so that the WhatsApp and AI budgets are
// scored TOGETHER against one margin floor. Two separately-sized budgets can each
// look affordable and still sink the margin between them.
//
// Nothing should import this file. It remains only so a stale import cannot break
// a build; new code imports from lib/margin.ts directly.
export {
  costPerSendPence,
  sendsPerUserPerMonth,
  waSpendAtFullBudgetPence,
  globalDailyCapFor,
  waSendsEnabled,
  waBudgetExceeded,
  MIN_DAILY_FLOOR,
} from './margin';
