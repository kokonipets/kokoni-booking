import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/chat/unread  → { count: number }
// Used for the Chat sidebar badge.
export async function GET() {
  const sb = createSupabaseServer()
  const { data } = await sb
    .from('sms_messages')
    .select('id')
    .eq('direction', 'inbound')
    .is('read_at', null)
    .limit(100)
  return NextResponse.json({ count: data?.length ?? 0 })
}
