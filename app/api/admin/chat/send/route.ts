import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

// POST /api/admin/chat/send  body: { phone, body }
export async function POST(req: NextRequest) {
  const { phone, body } = await req.json()
  if (!phone || !body) {
    return NextResponse.json({ error: 'phone + body required' }, { status: 400 })
  }

  const result = await sendSMS(phone, body, 'chatReply')

  // Also persist to sms_messages so the conversation thread sees the reply
  // regardless of mode (live/test/off). In test mode where the text was
  // suppressed, we still record it locally so the admin can see what was
  // attempted.
  const sb = createSupabaseServer()
  await sb.from('sms_messages').insert({
    direction: 'outbound',
    from_number: process.env.TWILIO_PHONE_NUMBER ?? '',
    to_number: phone,
    body,
    twilio_sid: 'sid' in result ? (result as { sid?: string }).sid ?? null : null,
  })

  return NextResponse.json(result)
}
