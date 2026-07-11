// lib/autonomy.ts. The autonomy dial: how much Lekhio is allowed to DO on the
// user's behalf, and the hard doctrine that no dial setting can ever cross.
//
// The customer picks a level. But the level only ever governs the SAFE,
// reversible admin work. Anything irreversible, anything that files to HMRC,
// pays or moves money, buys something, or messages a third party, ALWAYS needs
// an explicit human yes, at every level, forever. That rule lives here in code,
// not in a prompt, so it cannot be talked around, drifted, or bugged away.
//
// Why it is absolute: HMRC keeps the taxpayer personally responsible whoever
// prepared the return, and moving money is regulated. So the approval tap is not
// a timid default, it is the legal spine of the product. Lekhio does everything
// up to that line automatically; the tap is all that is left.
//
// Pure and deterministic, so the doctrine is exhaustively unit tested.

export type AutonomyLevel = 'suggest' | 'draft' | 'auto';

// How risky an action is.
//   admin        reversible, low stakes. Categorise a transaction, nudge a set
//                aside, send a reminder, log an entry, prompt to confirm.
//   prepare      builds something that leads to an irreversible step: draft an
//                invoice chase, pre-fill a quarterly update or a return.
//   irreversible real world consequence: file to HMRC, pay tax, move or transfer
//                money, buy something, send a message to a third party.
export type ActionClass = 'admin' | 'prepare' | 'irreversible';

// The action catalogue. Unknown actions are treated as irreversible on purpose,
// so a new action can never slip past the gate by being unclassified.
const ACTION_CLASS: Record<string, ActionClass> = {
  categorise_transaction: 'admin',
  update_set_aside: 'admin',
  send_reminder: 'admin',
  log_entry: 'admin',
  confirm_prompt: 'admin',
  apply_allowance_election: 'admin', // a calculation choice, changes no filing on its own
  tag_income_stream: 'admin',

  draft_invoice_chase: 'prepare',
  prepare_quarterly_update: 'prepare',
  prepare_tax_return: 'prepare',
  draft_message: 'prepare',

  file_to_hmrc: 'irreversible',
  submit_quarterly_update: 'irreversible',
  pay_tax: 'irreversible',
  move_money: 'irreversible',
  make_payment: 'irreversible',
  purchase: 'irreversible',
  send_to_third_party: 'irreversible',
  send_invoice: 'irreversible',
};

export function classifyAction(action: string): ActionClass {
  return ACTION_CLASS[action] ?? 'irreversible';
}

export type ActionMode = 'auto' | 'draft' | 'suggest';

export interface ActionDecision {
  mode: ActionMode; // auto = do it now; draft = prepare and present; suggest = just mention it
  requiresApproval: boolean; // true = a human yes is mandatory before any execution
  actionClass: ActionClass;
}

// The one function the agent asks before it does anything. Given an action and
// the user's dial setting, it returns how far Lekhio may go.
//
// The invariants, guaranteed for every input:
//   . An irreversible action ALWAYS has requiresApproval true and mode never
//     'auto', at every level. This is the doctrine.
//   . 'auto' only ever applies to reversible admin work.
//   . 'suggest' never prepares or executes anything.
export function decideAction(action: string, level: AutonomyLevel): ActionDecision {
  const actionClass = classifyAction(action);
  const requiresApproval = actionClass === 'irreversible';

  let mode: ActionMode;
  if (level === 'suggest') {
    mode = 'suggest';
  } else if (actionClass === 'admin' && level === 'auto') {
    mode = 'auto';
  } else {
    mode = 'draft';
  }

  // Belt and braces: nothing irreversible is ever auto, whatever the level.
  if (actionClass === 'irreversible' && mode === 'auto') mode = 'draft';

  return { mode, requiresApproval, actionClass };
}

// Convenience: may the agent execute this action with no human in the loop? Only
// ever true for reversible admin work at the auto level, never for money/filing.
export function canAutoExecute(action: string, level: AutonomyLevel): boolean {
  const d = decideAction(action, level);
  return d.mode === 'auto' && !d.requiresApproval;
}

// Parse a stored/user supplied level safely, defaulting to the most cautious.
export function parseLevel(value: string | null | undefined): AutonomyLevel {
  return value === 'draft' || value === 'auto' ? value : 'suggest';
}
