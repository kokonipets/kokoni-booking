import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/chat/messages?phone=+16264290038
// Returns full message history for one conversation.
// POST /api/admin/chat/messages  body: { phone }   — marks conversation as read.
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const sb = createSupabaseServer()

  const { data, error } = await sb
    .from('sms_messages')
    .select('id, created_at, direction, from_number, to_number, body, twilio_sid, read_at')
    .or(`from_number.eq.${phone},to_number.eq.${phone}`)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })
  const sb = createSupabaseServer()
  await sb
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('direction', 'inbound')
    .eq('from_number', phone)
    .is('read_at', null)
  return NextResponse.json({ ok: true })
}
