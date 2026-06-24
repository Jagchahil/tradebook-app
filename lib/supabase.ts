// Supabase access for the server side only.
//
// Per the build rules we never use supabase-js in API routes. The client caches
// the schema and goes stale after migrations. We hit the REST API with raw fetch
// using the service role key. The service role bypasses row level security, which
// is exactly what the webhook needs to write a transaction on the user's behalf.
//
// Never import this from client code. The service role key must never reach the
// browser.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function config(): { url: string; key: string } {
  if (!URL || !SERVICE_KEY) {
    throw new Error('Supabase env vars are missing.');
  }
  return { url: URL, key: SERVICE_KEY };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = config();
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

export interface NewTransaction {
  user_id: string;
  vendor: string;
  amount: number; // negative for an expense, positive for income
  category: string;
  transaction_date: string; // YYYY-MM-DD
  source_type: string; // for example whatsapp_image
  description?: string | null;
  raw_input_url?: string | null;
  confidence_score?: number | null;
  confirmed?: boolean;
  raw_whatsapp_message_id?: string | null;
}

// Find the TradeBook user whose stored phone matches this WhatsApp sender.
// WhatsApp sends the number without a plus, for example 447700900000. The app
// stores it as +447700900000. We check a few shapes to be safe.
export async function findUserIdByPhone(senderDigits: string): Promise<string | null> {
  const { url } = config();
  const digits = senderDigits.replace(/\D/g, '');
  const candidates = Array.from(
    new Set([`+${digits}`, digits, `+44${digits.replace(/^44/, '')}`]),
  );

  for (const phone of candidates) {
    const query = `${url}/rest/v1/users?phone_number=eq.${encodeURIComponent(phone)}&select=id&limit=1`;
    const res = await fetch(query, { headers: headers() });
    if (!res.ok) continue;
    const rows = (await res.json()) as Array<{ id: string }>;
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}

// True if we have already saved a transaction for this WhatsApp message id.
// This keeps us idempotent. Meta retries a webhook if we are slow, and we do not
// want a duplicate receipt each time.
export async function transactionExists(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const { url } = config();
  const query = `${url}/rest/v1/transactions?raw_whatsapp_message_id=eq.${encodeURIComponent(
    messageId,
  )}&select=id&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0;
}

export interface WaitlistSignup {
  phone: string;
  email?: string | null;
}

export async function insertWaitlistSignup(signup: WaitlistSignup): Promise<void> {
  const { url } = config();
  const record: Record<string, string> = { phone: signup.phone };
  if (signup.email) record.email = signup.email;

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Waitlist insert failed: ${res.status} ${text}`);
  }
}

export async function insertTransaction(record: NewTransaction): Promise<void> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/transactions`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert failed: ${res.status} ${text}`);
  }
}

// --- Invoices (read for the public invoice page, server side only) ---------

export interface InvoiceLine {
  description: string;
  amount: number;
}

export interface PublicInvoice {
  number: string;
  customer_name: string;
  customer_contact: string | null;
  line_items: InvoiceLine[];
  total: number;
  status: string;
  notes: string | null;
  issued_date: string | null;
  due_date: string | null;
  business_name: string | null;
  business_contact: string | null;
}

// Fetch one invoice plus the trader's business details. Uses the service role,
// so the page renders for anyone with the link without exposing the whole table.
export async function getPublicInvoice(id: string): Promise<PublicInvoice | null> {
  const { url } = config();

  const invRes = await fetch(
    `${url}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=number,customer_name,customer_contact,line_items,total,status,notes,issued_date,due_date,user_id&limit=1`,
    { headers: headers() },
  );
  if (!invRes.ok) return null;
  const rows = (await invRes.json()) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const inv = rows[0];

  let businessName: string | null = null;
  let businessContact: string | null = null;
  const userId = inv.user_id as string | undefined;
  if (userId) {
    const userRes = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,business_name,phone_number&limit=1`,
      { headers: headers() },
    );
    if (userRes.ok) {
      const urows = (await userRes.json()) as Array<{ name?: string; business_name?: string; phone_number?: string }>;
      if (urows.length > 0) {
        businessName = urows[0].business_name || urows[0].name || null;
        businessContact = urows[0].phone_number || null;
      }
    }
  }

  const lineItems = Array.isArray(inv.line_items) ? (inv.line_items as InvoiceLine[]) : [];

  return {
    number: (inv.number as string) ?? '',
    customer_name: (inv.customer_name as string) ?? '',
    customer_contact: (inv.customer_contact as string) ?? null,
    line_items: lineItems,
    total: Number(inv.total) || 0,
    status: (inv.status as string) ?? 'draft',
    notes: (inv.notes as string) ?? null,
    issued_date: (inv.issued_date as string) ?? null,
    due_date: (inv.due_date as string) ?? null,
    business_name: businessName,
    business_contact: businessContact,
  };
}
