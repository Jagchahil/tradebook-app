import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// ── Mocks (must be before any imports that trigger module resolution) ──────────

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'user-uuid-123' }, error: null }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}))

const mockSendTextMessage = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/whatsapp', () => ({
  validateWebhookSignature: vi.fn().mockReturnValue(true),
  sendTextMessage: mockSendTextMessage,
  downloadMedia: vi.fn().mockResolvedValue(Buffer.from('fake-audio')),
}))

vi.mock('@/lib/claude', () => ({
  parseReceipt: vi.fn().mockResolvedValue({
    amount: 47.5,
    vendor: 'Screwfix',
    category: 'materials',
    date: new Date().toISOString().split('T')[0],
    confidence: 0.95,
    notes: 'Drill bits and cable',
  }),
  parseTextExpense: vi.fn().mockResolvedValue({
    amount: 40,
    vendor: 'Esso',
    category: 'fuel',
    date: new Date().toISOString().split('T')[0],
    confidence: 0.9,
    notes: '',
  }),
}))

// Also mock fetch for the media URL lookup
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ url: 'https://example.com/fake-image.jpg' }),
  headers: { get: () => 'image/jpeg' },
} as unknown as Response)

// ── Helpers ───────────────────────────────────────────────────────────────────

const APP_SECRET = 'test-secret'

function buildSignature(body: string): string {
  const sig = crypto.createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')
  return `sha256=${sig}`
}

function makeImagePayload(from = '447911123456'): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  from,
                  type: 'image',
                  image: {
                    id: 'media-id-abc123',
                    mime_type: 'image/jpeg',
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  })
}

function makeRequest(body: string, signature: string): Request {
  return new Request('http://localhost/api/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/whatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_VERIFY_TOKEN = 'tradebook-verify-2024'
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    process.env.WHATSAPP_TOKEN = 'fake-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'
  })

  it('returns 200 for a valid image message webhook', async () => {
    const { POST } = await import('@/app/api/whatsapp/route')
    const body = makeImagePayload()
    const sig = buildSignature(body)
    const req = makeRequest(body, sig)

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('returns 403 when signature validation fails', async () => {
    const { validateWebhookSignature } = await import('@/lib/whatsapp')
    vi.mocked(validateWebhookSignature).mockReturnValueOnce(false)

    const { POST } = await import('@/app/api/whatsapp/route')
    const body = makeImagePayload()
    const req = makeRequest(body, 'sha256=invalid')

    const response = await POST(req as never)
    expect(response.status).toBe(403)
  })

  it('sends a WhatsApp reply after processing an image message', async () => {
    const { POST } = await import('@/app/api/whatsapp/route')
    const body = makeImagePayload('447911999888')
    const sig = buildSignature(body)
    const req = makeRequest(body, sig)

    await POST(req as never)

    // Allow the fire-and-forget async processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      '447911999888',
      expect.stringContaining('✓ £47.50'),
    )
  })

  it('returns 200 for a status update (no message field)', async () => {
    const { POST } = await import('@/app/api/whatsapp/route')
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }],
    })
    const sig = buildSignature(body)
    const req = makeRequest(body, sig)

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })
})

describe('GET /api/whatsapp (webhook verification)', () => {
  it('echoes hub.challenge when verify token matches', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'tradebook-verify-2024'
    const { GET } = await import('@/app/api/whatsapp/route')
    const url = new URL(
      'http://localhost/api/whatsapp?hub.mode=subscribe&hub.verify_token=tradebook-verify-2024&hub.challenge=CHALLENGE_CODE',
    )
    const req = new Request(url)

    const response = await GET(req as never)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toBe('CHALLENGE_CODE')
  })

  it('returns 403 when verify token does not match', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'tradebook-verify-2024'
    const { GET } = await import('@/app/api/whatsapp/route')
    const url = new URL(
      'http://localhost/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=CHALLENGE_CODE',
    )
    const req = new Request(url)

    const response = await GET(req as never)
    expect(response.status).toBe(403)
  })
})
