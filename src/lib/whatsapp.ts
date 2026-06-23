import crypto from 'crypto'

const GRAPH_API_VERSION = 'v18.0'
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN

  try {
    const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error('WhatsApp send failed:', response.status, body)
    }
  } catch (err) {
    console.error('WhatsApp send error:', err)
  }
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const token = process.env.WHATSAPP_TOKEN

  const metaResponse = await fetch(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!metaResponse.ok) {
    throw new Error(`Failed to get media URL: ${metaResponse.status}`)
  }

  const { url } = await metaResponse.json()

  const fileResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!fileResponse.ok) {
    throw new Error(`Failed to download media: ${fileResponse.status}`)
  }

  const arrayBuffer = await fileResponse.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export function validateWebhookSignature(body: string, signature: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) return false

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(body, 'utf8')
    .digest('hex')

  return `sha256=${expected}` === signature
}
