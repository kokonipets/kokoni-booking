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

// Store blocked dates in salon_settings as JSON array (key: 'blocked_dates_list')
// This avoids any issues with the blocked_dates table

async function getBlockedList(supabase: ReturnType<typeof getAdminClient>) {
  const { data } = await supabase
    .from('salon_settings')
    .select('value')
    .eq('key', 'blocked_dates_list')
    .single()
  if (!data) return []
  try { return JSON.parse(data.value) as { date: string; reason: string | null }[] }
  catch { return [] }
}

async function saveBlockedList(
  supabase: ReturnType<typeof getAdminClient>,
  list: { date: string; reason: string | null }[]
) {
  await supabase.from('salon_settings').upsert(
    { key: 'blocked_dates_list', value: JSON.stringify(list) },
    { onConflict: 'key' }
  )
}

export async function GET() {
  const supabase = getAdminClient()
  const list = await getBlockedList(supabase)
  return NextResponse.json({ blocked_dates: list })
}

export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { date, reason } = await req.json()
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })

  const list = await getBlockedList(supabase)
  const filtered = list.filter(d => d.date !== date)
  filtered.push({ date, reason: reason || null })
  filtered.sort((a, b) => a.date.localeCompare(b.date))
  await saveBlockedList(supabase, filtered)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { date } = await req.json()

  const list = await getBlockedList(supabase)
  const filtered = list.filter(d => d.date !== date)
  await saveBlockedList(supabase, filtered)
  return NextResponse.json({ success: true })
}
