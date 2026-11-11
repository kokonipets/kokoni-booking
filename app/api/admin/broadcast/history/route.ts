import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/admin/broadcast/history — the most recent announcements that were
// actually sent (test sends are never logged here), newest first.
export async function GET() {
  const supabase = getAdminClient()
  const base = 'id, message, tag_name, sent_count, failed_count, total_count, sent_at'
  const run = (cols: string) => supabase.from('broadcast_log').select(cols).order('sent_at', { ascending: false }).limit(50)
  let { data, error } = await run(base + ', recipients')
  if (error) ({ data, error } = await run(base)) // recipients column not migrated yet

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ history: data ?? [] })
}
