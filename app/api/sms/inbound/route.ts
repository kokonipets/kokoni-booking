import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

// Twilio posts here when someone texts our number.
// Configure in Twilio Console: Phone Numbers → Active → +1 (949) 868-0900
//   "A MESSAGE COMES IN" → Webhook → https://www.kokonipetsalon.com/api/sms/inbound (HTTP POST)
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

  if (!from || !body) {
    return xmlResponse('') // empty TwiML
  }

  const sb = createSupabaseServer()

  // Normalize the customer's number to 10-digit for joining with clients.phone
  const tenDigit = toTenDigits(from)

  // Log the inbound message
  await sb.from('sms_messages').insert({
    direction: 'inbound',
    from_number: from,
    to_number: to,
    body,
    twilio_sid: sid,
    client_phone: tenDigit,
  })

  // Handle keyword responses (Twilio also handles STOP automatically, but we
  // acknowledge in our own log so the chat view shows what happened)
  const firstWord = body.trim().split(/\s+/)[0]?.toUpperCase() ?? ''

  if (STOP_WORDS.has(firstWord)) {
    // Twilio auto-blocks future outbound to this number. No TwiML reply needed
    // (Twilio sends its own STOP confirmation per carrier rules).
    return xmlResponse('')
  }

  if (HELP_WORDS.has(firstWord)) {
    return xmlResponse(
      'Kokoni Pet Grooming Salon: For help, call (949) 508-9155. Reply STOP to opt out.'
    )
  }

  if (START_WORDS.has(firstWord)) {
    return xmlResponse(
      'Kokoni Pet Grooming Salon: You are re-subscribed to appointment messages. Reply STOP to opt out.'
    )
  }

  // No auto-reply for normal messages — they'll be seen in the Chat tab and
  // replied to manually by admin/front-desk staff.
  return xmlResponse('')
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
