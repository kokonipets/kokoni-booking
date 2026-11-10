import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

// Twilio posts here when someone texts our number.
// Configure in Twilio Console: Messaging Services → Kokoni Pet Grooming Salon → Integration
//   "Send a webhook" → https://book.kokonipets.com/api/sms/inbound (HTTP POST)
export const dynamic = 'force-dynamic'

// Strip +1 / spaces / dashes → 10-digit
function toTenDigits(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const HELP_WORDS = new Set(['HELP', 'INFO'])
const START_WORDS = new Set(['START', 'YES', 'UNSTOP'])

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const from = String(formData.get('From') ?? '')         // e.g. "+16264290038"
  const to = String(formData.get('To') ?? '')             // our Twilio number
  const body = String(formData.get('Body') ?? '').trim()
  const sid = String(formData.get('MessageSid') ?? '')
  const mediaCount = parseInt(String(formData.get('NumMedia') ?? '0'), 10) || 0

  // Skip only if there's nothing at all (no text AND no photo). A photo-only MMS
  // has an empty body but should still be logged so it shows in the chat.
  if (!from || (!body && mediaCount === 0)) {
    return xmlResponse('') // empty TwiML
  }

  const sb = createSupabaseServer()

  // Normalize the customer's number to 10-digit for joining with clients.phone
  const tenDigit = toTenDigits(from)

  // Log the inbound message. The DB has a unique index on twilio_sid, so even if
  // Twilio retries the webhook (or the poller races), duplicates are rejected —
  // we just ignore the 23505 conflict instead of erroring.
  const { error: insertErr } = await sb.from('sms_messages').insert({
    direction: 'inbound',
    from_number: from,
    to_number: to,
    body,
    twilio_sid: sid,
    client_phone: tenDigit,
    media_count: mediaCount,
  })
  if (insertErr && insertErr.code !== '23505') {
    console.error('Inbound SMS insert error:', insertErr)
  }

  // Handle keyword responses (Twilio also handles STOP automatically, but we
  // acknowledge in our own log so the chat view shows what happened)
  const firstWord = body.trim().split(/\s+/)[0]?.toUpperCase() ?? ''

  if (STOP_WORDS.has(firstWord)) {
    // Twilio auto-blocks future outbound to this number. No TwiML reply needed
    // (Twilio sends its own STOP confirmation per carrier rules).
    // Also record the opt-out on the client so they drop out of announcement
    // lists and show under "Not Opted In" (best-effort; phone may be stored
    // in a different format, so match on any of the common variants).
    await setConsentByPhone(sb, tenDigit, false)
    return xmlResponse('')
  }

  if (HELP_WORDS.has(firstWord)) {
    return xmlResponse(
      'Kokoni Pet Grooming Salon: For help, call (626) 621-4646. Reply STOP to opt out.'
    )
  }

  if (START_WORDS.has(firstWord)) {
    await setConsentByPhone(sb, tenDigit, true)
    return xmlResponse(
      'Kokoni Pet Grooming Salon: You are re-subscribed to appointment messages. Reply STOP to opt out.'
    )
  }

  // (Review requests no longer ask for a 1-5 rating, so replies are normal chat messages.)

  // No auto-reply for normal messages — they'll be seen in the Chat tab and
  // replied to manually by admin/front-desk staff.
  return xmlResponse('')
}

async function setConsentByPhone(sb: ReturnType<typeof createSupabaseServer>, tenDigit: string, consent: boolean) {
  if (!tenDigit || tenDigit.length !== 10) return
  const variants = [tenDigit, `+1${tenDigit}`, `1${tenDigit}`, `(${tenDigit.slice(0, 3)}) ${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`, `${tenDigit.slice(0, 3)}-${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`]
  try {
    const { error } = await sb.from('clients').update({ sms_consent: consent, sms_consent_at: new Date().toISOString() }).in('phone', variants)
    if (error) console.error('Opt-out/in consent update failed:', error.message)
  } catch (e) {
    console.error('Opt-out/in consent update failed:', e)
  }
}

function xmlResponse(message: string) {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
