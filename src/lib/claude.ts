import Anthropic from '@anthropic-ai/sdk'

export type ParsedReceipt = {
  amount: number | null
  vendor: string | null
  category: string
  date: string
  confidence: number
  notes: string
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const RECEIPT_SYSTEM_PROMPT = `You are parsing a receipt or expense photo for a UK sole trader tradesperson.
Extract the following and return ONLY valid JSON, no markdown, no explanation:
{
  "amount": number (GBP amount as a number, e.g. 47.50),
  "vendor": string (shop or supplier name, e.g. "Screwfix"),
  "category": one of: "materials" | "fuel" | "tools" | "subcontractors" | "food" | "professional_fees" | "other",
  "date": "YYYY-MM-DD" (use today's date if not visible on receipt),
  "confidence": number between 0.0 and 1.0,
  "notes": string (any relevant detail, empty string if none)
}
If you cannot determine the amount with any confidence, set amount to null.`

const TEXT_EXPENSE_SYSTEM_PROMPT = `You are extracting expense information from a message sent by a UK sole trader tradesperson.
The message may be a typed note or a voice transcription.
Extract the following and return ONLY valid JSON, no markdown, no explanation:
{
  "amount": number (GBP amount as a number, e.g. 47.50),
  "vendor": string (shop or supplier name, or null if not mentioned),
  "category": one of: "materials" | "fuel" | "tools" | "subcontractors" | "food" | "professional_fees" | "other",
  "date": "YYYY-MM-DD" (use today's date if not mentioned),
  "confidence": number between 0.0 and 1.0,
  "notes": string (any relevant detail, empty string if none)
}
If you cannot determine the amount, set amount to null.`

function parseReceiptJson(raw: string): ParsedReceipt {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned)
  return {
    amount: parsed.amount ?? null,
    vendor: parsed.vendor ?? null,
    category: parsed.category ?? 'other',
    date: parsed.date ?? new Date().toISOString().split('T')[0],
    confidence: parsed.confidence ?? 0,
    notes: parsed.notes ?? '',
  }
}

export async function parseReceipt(imageUrl: string): Promise<ParsedReceipt> {
  const imageResponse = await fetch(imageUrl, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
  })

  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`)
  }

  const imageBuffer = await imageResponse.arrayBuffer()
  const base64 = Buffer.from(imageBuffer).toString('base64')
  const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    temperature: 0,
    system: RECEIPT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Parse this receipt.',
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseReceiptJson(text)
}

export async function parseTextExpense(text: string): Promise<ParsedReceipt> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    temperature: 0,
    system: TEXT_EXPENSE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: text,
      },
    ],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseReceiptJson(raw)
}
