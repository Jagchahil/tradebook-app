import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendTextMessage } from '@/lib/whatsapp'

function normalizeUKPhone(raw: string): string | null {
  const s = raw.replace(/[\s\-\(\)\.]/g, '')
  if (/^\+44\d{10}$/.test(s)) return s
  if (/^44\d{10}$/.test(s)) return `+${s}`
  if (/^07\d{9}$/.test(s)) return `+44${s.slice(1)}`
  if (/^7\d{9}$/.test(s)) return `+44${s}`
  return null
}

export async function POST(request: NextRequest) {
  let body: { phone?: string; email?: string; tradeType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { phone, email, tradeType } = body

  if (!phone && !email) {
    return NextResponse.json({ error: 'Please provide a mobile number.' }, { status: 400 })
  }

  const normalizedPhone = phone ? normalizeUKPhone(phone) : null

  if (phone && !normalizedPhone) {
    return NextResponse.json(
      { error: 'Please enter a valid UK mobile number (e.g. 07911 123456).' },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin.from('waitlist').insert({
    phone_number: normalizedPhone,
    email: email ?? null,
    trade_type: tradeType ?? null,
  })

  if (error) {
    if (error.code === '23505') {
      // Duplicate, treat as success so we don't leak whether a number is registered
      return NextResponse.json({ ok: true })
    }
    console.error('Waitlist insert error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // WhatsApp confirmation, only runs once credentials are configured
  if (normalizedPhone && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    sendTextMessage(
      normalizedPhone,
      "You're on the TradeBook waitlist 👍 We'll text you when we launch, you'll get 60 days free. Any questions? Just reply here.",
    ).catch((err) => console.error('Waitlist WhatsApp send failed:', err))
  }

  return NextResponse.json({ ok: true })
}
