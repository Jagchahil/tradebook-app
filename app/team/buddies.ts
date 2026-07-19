// THE AI WORKFORCE, as data. One place that names every worker, its colour, its status, and where
// its page lives. The console reads this; nothing hard-codes a buddy anywhere else.
//
// Status is honest: 'live' works now, 'waking' is being built, 'asleep' is hired later. The overview
// draws an awake buddy for live/waking and a sleeping one (with zzz) for asleep, so the screen never
// pretends a bot is running when it is not.

export type BuddyStatus = 'live' | 'waking' | 'asleep';
export type Emblem = 'search' | 'spanner' | 'clipboard' | 'megaphone' | 'coin' | 'tag' | 'people' | 'shield';

export interface BuddyDef {
  key: string;
  name: string;
  role: string;        // e.g. 'CKO · Knowledge'
  g1: string;          // gradient start
  g2: string;          // gradient end
  status: BuddyStatus;
  statusWord: string;  // 'watching', 'warming up', 'napping'
  emblem: Emblem;
  href: string;        // its page
  reportsToList: 'approve' | 'needs' | 'none'; // where its items land, informational only
}

// The six that sit in the constellation and the report grid. Kaardaar and Munsif are on the roster
// (docs/115) but join the console once their trigger fires, so they are not drawn yet.
export const BUDDIES: BuddyDef[] = [
  { key: 'gyani',     name: 'Gyani',     role: 'CKO · Knowledge',   g1: '#0F7B4F', g2: '#22B573', status: 'live',   statusWord: 'watching',   emblem: 'search',    href: '/team/knowledge', reportsToList: 'approve' },
  { key: 'mistri',    name: 'Mistri',    role: 'CTO · Watch',       g1: '#1B59A6', g2: '#3B82D6', status: 'live',   statusWord: 'quiet watch',emblem: 'spanner',   href: '/team/system',    reportsToList: 'needs' },
  { key: 'munshi',    name: 'Munshi',    role: 'Chief of Staff',    g1: '#3F51B5', g2: '#6172D6', status: 'waking', statusWord: 'warming up',  emblem: 'clipboard', href: '/team',           reportsToList: 'approve' },
  { key: 'hoka',      name: 'Hoka',      role: 'CMO · Marketing',   g1: '#E8973A', g2: '#F6B95C', status: 'asleep', statusWord: 'napping',     emblem: 'megaphone', href: '/team',    reportsToList: 'needs' },
  { key: 'khazanchi', name: 'Khazanchi', role: 'CFO · Finance',     g1: '#0E7C86', g2: '#1AA5B0', status: 'asleep', statusWord: 'napping',     emblem: 'coin',      href: '/team/numbers',   reportsToList: 'none' },
  { key: 'saudagar',  name: 'Saudagar',  role: 'CRO · Revenue',     g1: '#7E5AC2', g2: '#9E7BE0', status: 'asleep', statusWord: 'napping',     emblem: 'tag',       href: '/team/customers', reportsToList: 'none' },
];

export function buddy(key: string): BuddyDef {
  return BUDDIES.find((b) => b.key === key) ?? BUDDIES[0];
}

// EVERY social platform Hoka publishes to, once each is connected and approved. Jag: "run up all forms
// of social media." Each carries whether it needs a platform app review (the long pole, docs/115).
export interface SocialPlatform { key: string; label: string; needsReview: boolean; }
export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: 'facebook',  label: 'Facebook',  needsReview: true },
  { key: 'instagram', label: 'Instagram', needsReview: true },
  { key: 'tiktok',    label: 'TikTok',    needsReview: true },
  { key: 'linkedin',  label: 'LinkedIn',  needsReview: true },
  { key: 'youtube',   label: 'YouTube',   needsReview: true },
  { key: 'x',         label: 'X',         needsReview: true },
  { key: 'threads',   label: 'Threads',   needsReview: true },
  { key: 'pinterest', label: 'Pinterest', needsReview: true },
  { key: 'snapchat',  label: 'Snapchat',  needsReview: true },
];

// --- the CEO to-do list ------------------------------------------------------------------------
// Two kinds, exactly the model Jag set: an 'approve' item is one a bot can finish on his yes, a
// 'needs' item is one only he can do. This SEED is a stub. It becomes GET /api/team/todos later, so
// the shape here is the shape the endpoint returns. Nothing here is derived from customer data.

export type TodoKind = 'approve' | 'needs';
export type TodoPrio = 'hi' | 'md' | 'lo';

export interface TodoItem {
  id: string;
  kind: TodoKind;
  buddyKey: string;      // who raised it, for the chip
  text: string;
  from: string;          // 'from Munshi · doc 114'
  where?: string;        // 'needs your Mac', '2 min on your phone'
  prio: TodoPrio;
  doneLabel?: string;    // for approve: 'Published by Gyani', else a default is used
  done?: boolean;        // already cleared on the server, so it renders done on load
}

// A fallback the console shows only if the live list cannot be read. The real list now comes from
// GET /api/team/todos (the team_todos table), which Munshi replaces each morning.
export const SEED_TODOS: TodoItem[] = [
  // approve, a bot finishes it
  { id: 'gyani-vat', kind: 'approve', buddyKey: 'gyani', prio: 'md',
    text: 'GOV.UK renamed the VAT registration page overnight. I found the new address and prepared the fix.',
    from: 'from Gyani · will publish it', doneLabel: 'Published by Gyani' },
  { id: 'munshi-start', kind: 'approve', buddyKey: 'munshi', prio: 'hi',
    text: 'Approve me to start, and your morning brief lands in your inbox from tomorrow.',
    from: 'from Munshi · runs itself once on', doneLabel: 'Munshi is on it' },

  // needs you, only Jag can
  { id: 'munshi-setup', kind: 'needs', buddyKey: 'munshi', prio: 'hi',
    text: 'Decide my five setup choices (channel, time, name, cadence, install), so you can hire me.',
    from: 'from Munshi · doc 114', where: '2 min, on your phone' },
  { id: 'hoka-shots', kind: 'needs', buddyKey: 'hoka', prio: 'md',
    text: 'Redo the App Store screenshots: real wordmark, one WhatsApp frame, benchmark vs Xero, QuickBooks, Monzo.',
    from: "from Hoka · yours until I'm hired" },
  { id: 'mistri-openai', kind: 'needs', buddyKey: 'mistri', prio: 'md',
    text: 'Paste the OpenAI key into Vercel and redeploy, to switch voice notes on.',
    from: 'from Mistri', where: 'needs your Mac' },
  { id: 'mistri-stripe', kind: 'needs', buddyKey: 'mistri', prio: 'lo',
    text: 'Turn on the Stripe customer portal in the dashboard so people can manage their own billing.',
    from: 'from Mistri', where: 'needs your Mac' },
];
