# 06: Stack

## Guiding Principle

Use the simplest stack that Claude Code can move fastest on. No premature optimisation. No over-engineering. Add complexity only when a simpler approach provably breaks.

---

## Phase 0 Stack (Build Now)

### Backend + Webhook
**Next.js (App Router) on Vercel**
- API routes for WhatsApp webhook (`/api/whatsapp/route.ts`)
- Server-side rendering for the web dashboard
- Serverless functions: no servers to manage
- Deploys in seconds from GitHub push
- Free tier covers Phase 0 comfortably

### Database + Auth
**Supabase**
- Postgres database (hosted, managed)
- Supabase Storage for receipt images and voice notes
- Row-level security (RLS) for data isolation
- Real-time subscriptions (useful for live dashboard updates)
- Free tier: 500MB database, 1GB storage, 50k MAU: covers Phase 0

### AI
**Anthropic API**
- `claude-sonnet-4-6` for all conversation, Q&A, summaries
- Claude Vision for receipt/image parsing (pass image URL directly)
- Claude for voice note transcription (or use Whisper if cheaper at scale)
- Receipt parsing: structured JSON output, low temperature for consistency

### WhatsApp
**Meta Cloud API (direct)**
- No Twilio. No 360dialog. No third-party middleware.
- Use Meta's Cloud API directly via REST
- Sandbox mode available immediately (5 test numbers)
- Production access after Meta Business verification (1 to 5 days)
- Webhook: single endpoint, handles all message types

### Hosting
**Vercel**
- Free tier for Phase 0
- Automatic HTTPS
- GitHub integration (push to main = deploy)
- Edge functions if webhook response time becomes an issue

---

## Phase 1 Additions (Native App)

### Mobile
**React Native + Expo**
- Single codebase for iOS and Android
- Expo handles App Store / Play Store submission pain
- Expo Go for fast internal testing (no TestFlight needed during dev)
- Expo Router for navigation
- React Native Paper or NativeWind for UI

### Payments
**Stripe**
- Subscriptions (£12.99/mo, 30-day trial)
- Stripe Billing handles dunning (failed payments, retries)
- Stripe Customer Portal for self-service cancellation
- Never store card data: Stripe handles everything
- Webhook: `customer.subscription.deleted`, `invoice.payment_failed` → update Supabase user record

---

## Phase 2 Additions (Marketing Engine)

### Video Generation
**Higgsfield API** (already connected via Cowork)
- Generate 15 to 30 second videos from prompts
- Tradesperson-on-site scenarios
- Variations: different trades, different scenarios, A/B hooks

### Ad APIs
**Meta Marketing API**
- Create campaigns, ad sets, ads programmatically
- Upload creative assets
- Pull performance data (CPM, CTR, CPA, ROAS)

**TikTok Ads API**
- Same pattern as Meta

### Image Generation
**Anthropic Claude** (or Stability AI / DALL-E)
- Carousel slide generation
- Static ad creative
- Claude for copy generation

---

## Key Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "@supabase/supabase-js": "^2.45.0",
    "next": "^15.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0"
  }
}
```

---

## Environment Variables

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# WhatsApp / Meta
WHATSAPP_TOKEN=              # Meta Cloud API access token (from Meta developer console)
WHATSAPP_PHONE_NUMBER_ID=    # Phone number ID (from Meta console → WhatsApp → API Setup)
WHATSAPP_VERIFY_TOKEN=       # Self-defined string for webhook verification
WHATSAPP_APP_SECRET=         # App secret for signature validation

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only, never expose to client

# Phase 1
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## Meta Cloud API. Key Endpoints

```
# Send a text message
POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_TOKEN}
{
  "messaging_product": "whatsapp",
  "to": "{recipient_phone}",    // E.164 format: +447911123456
  "type": "text",
  "text": { "body": "✓ £83. Screwfix, materials, today." }
}

# Download media (receipt images, voice notes)
GET https://graph.facebook.com/v18.0/{MEDIA_ID}
→ Returns URL
GET {url}
Authorization: Bearer {WHATSAPP_TOKEN}
→ Returns binary file
```

---

## Supabase RLS Policies

```sql
-- Users can only see their own data
alter table transactions enable row level security;

create policy "Users see own transactions"
  on transactions for select
  using (user_id = auth.uid());

create policy "Users insert own transactions"
  on transactions for insert
  with check (user_id = auth.uid());
```

---

## Webhook Security

Every incoming POST to `/api/whatsapp` must validate the Meta signature:

```typescript
import crypto from 'crypto'

function validateSignature(body: string, signature: string, appSecret: string): boolean {
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(body, 'utf8')
    .digest('hex')
  return `sha256=${expected}` === signature
}
```

Reject any request where this validation fails with a 403.

---

## Deployment

```bash
# Initial setup
npx create-next-app@latest tradebook --typescript --app --tailwind --src-dir
cd tradebook
npm install @supabase/supabase-js @anthropic-ai/sdk

# Link to Vercel
npx vercel

# Set env vars
vercel env add ANTHROPIC_API_KEY
vercel env add WHATSAPP_TOKEN
# ... etc

# Deploy
git push origin main  # auto-deploys via GitHub integration
```

---

## Costs (Phase 0)

| Service | Cost |
|---|---|
| Vercel | Free (Hobby) |
| Supabase | Free tier |
| Anthropic API | ~£0.003 per receipt parse (claude-sonnet-4-6) |
| Meta Cloud API | Free for service messages (user-initiated) |
| **Total Phase 0** | **~£0/month + ~£0.003/user interaction** |
