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
      'Kokoni Pet Grooming Salon: For help, call (626) 621-4646. Reply STOP to opt out.'
    )
  }

  if (START_WORDS.has(firstWord)) {
    return xmlResponse(
      'Kokoni Pet Grooming Salon: You are re-subscribed to appointment messages. Reply STOP to opt out.'
    )
  }

  // Check if this is a review rating response (1-5)
  const ratingMatch = body.match(/^[1-5]/)
  if (ratingMatch) {
    const rating = parseInt(ratingMatch[0])
    // Look for a recent pending review for this phone (within 48 hours)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: review } = await sb
      .from('reviews')
      .select('*')
      .eq('client_phone', tenDigit)
      .in('status', ['pending'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (review) {
      // Update review with rating
      await sb
        .from('reviews')
        .update({
          rating,
          response_text: body,
          rating_received_at: new Date().toISOString(),
          status: rating >= 4 ? 'positive' : 'negative',
        })
        .eq('id', review.id)

      await sb.from('review_activity_log').insert({
        review_id: review.id,
        action: 'rating_received',
        actor: 'system',
        details: { rating, from },
      })

      // Fetch settings
      const { data: settings } = await sb
        .from('review_settings')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (settings) {
        if (rating >= 4) {
          // Positive: send review links
          let msg = settings.positive_response_template ?? ''
          if (settings.google_review_url) msg = msg.replace('{google_url}', settings.google_review_url)
          if (settings.yelp_business_url) msg = msg.replace('{yelp_url}', settings.yelp_business_url)
          if (msg) await sendSMS(tenDigit, msg)
        } else {
          // Negative: send feedback request + alert admin
          if (settings.feedback_request_template) {
            await sendSMS(tenDigit, settings.feedback_request_template)
          }
          if (settings.alert_on_negative && settings.admin_alert_phone) {
            const alert = `⚠️ Negative review! ${review.client_name ?? tenDigit} gave ${rating}★. Message: "${body}"`
            await sendSMS(settings.admin_alert_phone, alert)
          }
          // Log alert
          await sb.from('review_alerts').insert({
            review_id: review.id,
            client_phone: tenDigit,
            client_name: review.client_name,
            rating,
            feedback_text: body,
            status: 'pending',
          })
        }
      }

      // Don't show review responses in Chat — handled above
      return xmlResponse('')
    }
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
