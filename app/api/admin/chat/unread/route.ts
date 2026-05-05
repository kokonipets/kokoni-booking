import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/chat/unread  → { count: number }
// Used for the Chat sidebar badge.
export async function GET() {
  const sb = createSupabaseServer()
  const { count } = await sb
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'inbound')
    .is('read_at', null)
  return NextResponse.json({ count: count ?? 0 })
}
