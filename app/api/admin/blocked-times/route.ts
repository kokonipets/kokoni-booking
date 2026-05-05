import { NextRequest, NextResponse } from 'next/server'
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

type BlockedTime = { date: string; time: string; reason: string | null }

async function getList(supabase: ReturnType<typeof getAdminClient>): Promise<BlockedTime[]> {
  const { data } = await supabase
    .from('salon_settings')
    .select('value')
    .eq('key', 'blocked_times_list')
    .single()
  if (!data) return []
  try { return JSON.parse(data.value) as BlockedTime[] }
  catch { return [] }
}

async function saveList(
  supabase: ReturnType<typeof getAdminClient>,
  list: BlockedTime[]
) {
  await supabase.from('salon_settings').upsert(
    { key: 'blocked_times_list', value: JSON.stringify(list) },
    { onConflict: 'key' }
  )
}

// GET /api/admin/blocked-times?date=YYYY-MM-DD  (optional filter)
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const date = new URL(req.url).searchParams.get('date')
  let list = await getList(supabase)
  if (date) list = list.filter(b => b.date === date)
  return NextResponse.json({ blocked_times: list })
}

// POST /api/admin/blocked-times  { date, time, reason }
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { date, time, reason } = await req.json()
  if (!date || !time) return NextResponse.json({ error: 'Date and time required' }, { status: 400 })

  const list = await getList(supabase)
  const filtered = list.filter(b => !(b.date === date && b.time === time))
  filtered.push({ date, time, reason: reason || null })
  filtered.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  await saveList(supabase, filtered)
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/blocked-times  { date, time }
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { date, time } = await req.json()
  if (!date || !time) return NextResponse.json({ error: 'Date and time required' }, { status: 400 })

  const list = await getList(supabase)
  const filtered = list.filter(b => !(b.date === date && b.time === time))
  await saveList(supabase, filtered)
  return NextResponse.json({ success: true })
}
