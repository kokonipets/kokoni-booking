import { NextRequest, NextResponse } from 'next/server'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

// POST /api/admin/chat/send  body: { phone, body }
export async function POST(req: NextRequest) {
  const { phone, body } = await req.json()
  if (!phone || !body) {
    return NextResponse.json({ error: 'phone + body required' }, { status: 400 })
  }

  // sendSMS mirrors the message into sms_messages (in all modes), so the
  // conversation thread sees the reply without a duplicate insert here.
  const result = await sendSMS(phone, body, 'chatReply')

  return NextResponse.json(result)
}
