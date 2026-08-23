import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

// Twilio posts here every time an outbound message's delivery state changes
// (queued → sent → delivered, or → undelivered/failed with an ErrorCode).
// Configure once in Twilio Console: Phone Numbers → Manage → Active Numbers →
// (626) 789-0858 → Messaging configuration → "A message comes in" status
// callback, OR set per-message via the `statusCallback` param (already wired
// in lib/sms.ts) → https://book.kokonipets.com/api/sms/status (HTTP POST)
//
// Without this, sms_log only ever shows the initial "sent" state (Twilio
// accepted the send request) and never reflects whether the carrier actually
// delivered it — which is how undelivered messages (e.g. landline numbers,
// error 30006) went unnoticed until a customer complained.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const messageSid = String(formData.get('MessageSid') ?? formData.get('SmsSid') ?? '')
    const messageStatus = String(formData.get('MessageStatus') ?? formData.get('SmsStatus') ?? '')
    const errorCode = formData.get('ErrorCode') ? String(formData.get('ErrorCode')) : null

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ success: false, error: 'Missing MessageSid/MessageStatus' }, { status: 400 })
    }

    const sb = createSupabaseServer()
    const update: Record<string, unknown> = {
      delivery_status: messageStatus,
      delivery_error_code: errorCode,
    }
    if (messageStatus === 'delivered' || messageStatus === 'undelivered' || messageStatus === 'failed') {
      update.delivered_at = new Date().toISOString()
    }

    const { error } = await sb.from('sms_log').update(update).eq('twilio_sid', messageSid)
    if (error) console.error('[sms/status] failed to update sms_log:', error)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[sms/status] webhook error:', e)
    // Always 200 so Twilio doesn't retry-storm us
    return NextResponse.json({ success: false })
  }
}
