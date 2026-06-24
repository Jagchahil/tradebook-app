import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { validateWebhookSignature, sendTextMessage, downloadMedia } from '@/lib/whatsapp'
import { parseReceipt, parseTextExpense, ParsedReceipt } from '@/lib/claude'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  if (!validateWebhookSignature(rawBody, signature)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let body: WhatsAppWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  waitUntil(processWebhook(body).catch((err) => console.error('Webhook processing error:', err)))

  return new NextResponse('OK', { status: 200 })
}

async function processWebhook(body: WhatsAppWebhookBody): Promise<void> {
  const entry = body.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const message = value?.messages?.[0]

  if (!message) return

  const from = message.from
  const messageType = message.type

  const user = await upsertUser(from)
  if (!user) return

  let parsed: ParsedReceipt | null = null
  let sourceType: 'photo' | 'voice' | 'text' = 'text'
  let rawInputUrl: string | null = null

  try {
    if (messageType === 'image' && message.image?.id) {
      sourceType = 'photo'
      const mediaUrl = await getMediaUrl(message.image.id)
      rawInputUrl = mediaUrl
      parsed = await parseReceipt(mediaUrl)
    } else if (messageType === 'audio' && message.audio?.id) {
      sourceType = 'voice'
      const audioBuffer = await downloadMedia(message.audio.id)
      const transcription = await transcribeAudio(audioBuffer)
      parsed = await parseTextExpense(transcription)
    } else if (messageType === 'text' && message.text?.body) {
      sourceType = 'text'
      parsed = await parseTextExpense(message.text.body)
    } else {
      await sendTextMessage(from, "I can handle photos, voice notes, and text. Send me a receipt photo or tell me what you spent.")
      return
    }
  } catch (err) {
    console.error('Parse error:', err)
    await sendTextMessage(from, "Something went wrong processing that. Can you try again?")
    return
  }

  if (!parsed || parsed.amount === null) {
    await sendTextMessage(from, "I couldn't read that receipt clearly. Can you send it again or type the amount?")
    return
  }

  const monthTotal = await storeTransaction(user.id, parsed, sourceType, rawInputUrl)
  const reply = buildReply(parsed, monthTotal)
  await sendTextMessage(from, reply)
}

async function upsertUser(phoneNumber: string): Promise<{ id: string } | null> {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone_number', phoneNumber)
    .single()

  if (existing) return existing

  const { data: created, error } = await supabaseAdmin
    .from('users')
    .insert({ phone_number: phoneNumber })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create user:', error)
    return null
  }

  return created
}

async function getMediaUrl(mediaId: string): Promise<string> {
  const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  })
  const data = await response.json()
  return data.url
}

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  console.error('Audio transcription not yet implemented, buffer size:', audioBuffer.length)
  return ''
}

async function storeTransaction(
  userId: string,
  parsed: ParsedReceipt,
  sourceType: 'photo' | 'voice' | 'text',
  rawInputUrl: string | null,
): Promise<number> {
  const txDate = new Date(parsed.date)
  const year = txDate.getFullYear()
  const month = txDate.getMonth() + 1

  await supabaseAdmin.from('transactions').insert({
    user_id: userId,
    amount: parsed.amount,
    vendor: parsed.vendor,
    category: parsed.category,
    transaction_date: parsed.date,
    description: parsed.notes || null,
    source_type: sourceType,
    raw_input_url: rawInputUrl,
    confidence_score: parsed.confidence,
    confirmed: parsed.confidence >= 0.7,
  })

  await supabaseAdmin.rpc('increment_monthly_summary', {
    p_user_id: userId,
    p_year: year,
    p_month: month,
    p_amount: parsed.amount,
  })

  const { data: summary } = await supabaseAdmin
    .from('monthly_summaries')
    .select('total_expenses')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .single()

  return summary?.total_expenses ?? (parsed.amount ?? 0)
}

function buildReply(parsed: ParsedReceipt, monthTotal: number): string {
  const amount = parsed.amount!.toFixed(2)
  const vendor = parsed.vendor ?? 'unknown supplier'
  const category = parsed.category
  const date = formatDate(parsed.date)
  const total = monthTotal.toFixed(2)
  const monthName = new Date(parsed.date).toLocaleString('en-GB', { month: 'long' })

  if (parsed.confidence < 0.7) {
    return `I got a ${vendor} receipt for £${amount} — is that right? Reply YES to confirm or correct me.`
  }

  return `✓ £${amount} — ${vendor}, ${category}, ${date}. ${monthName} total: £${total}.`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()

  if (isToday) return 'today'

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string }
          audio?: { id: string; mime_type: string }
        }>
      }
    }>
  }>
}
