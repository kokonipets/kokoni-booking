import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
import twilio from 'twilio'

export const dynamic = 'force-dynamic'

function toTenDigits(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// GET /api/admin/chat/sync
// Polls Twilio API for recent inbound messages and syncs them to sms_messages table.
// Called by the chat UI every 15s as a fallback when webhooks aren't firing.
export async function GET() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const ourNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !ourNumber) {
      return NextResponse.json({ error: 'Missing Twilio env vars' }, { status: 500 })
    }

    const client = twilio(accountSid, authToken)
    const sb = createSupabaseServer()

    // Fetch last 50 inbound messages to our number from the past 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const messages = await client.messages.list({
      to: ourNumber,
      dateSentAfter: since,
      pageSize: 50,
    })

    let newCount = 0

    for (const msg of messages) {
      // Check if already in DB
      const { data: existing } = await sb
        .from('sms_messages')
        .select('id')
        .eq('twilio_sid', msg.sid)
        .maybeSingle()

      if (!existing) {
        const tenDigit = toTenDigits(msg.from)
        const mediaCount = parseInt(String(msg.numMedia ?? '0'), 10) || 0
        const { error: insertError } = await sb.from('sms_messages').insert({
          direction: 'inbound',
          from_number: msg.from,
          to_number: msg.to,
          body: msg.body,
          twilio_sid: msg.sid,
          client_phone: tenDigit,
          media_count: mediaCount,
          created_at: msg.dateSent?.toISOString() ?? new Date().toISOString(),
        })
        // Skip-and-continue on any insert problem so one bad row never breaks
        // the whole chat. 23505 = duplicate (expected under 15s polling).
        if (insertError) {
          if (insertError.code !== '23505') console.error('Insert error:', insertError)
        } else {
          newCount++
        }
      }
    }

    // Debug: check if we can read back from sms_messages
    const { data: readCheck, error: readError } = await sb
      .from('sms_messages')
      .select('id, direction, client_phone')
      .limit(5)

    return NextResponse.json({
      synced: newCount,
      total: messages.length,
      dbReadCount: readCheck?.length ?? 0,
      dbReadError: readError?.message ?? null,
    })
  } catch (error: any) {
    console.error('Chat sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
