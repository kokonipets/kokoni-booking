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

function normalizePhone(p?: string | null): string {
  return (p || '').replace(/\D/g, '')
}

// GET /api/admin/deleted-clients?phone=xxx&limit=50
// Browse the snapshot log left behind whenever a client was deleted. Matches by
// normalized digits so any stored phone format still finds the right record.
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const phoneFilter = searchParams.get('phone')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500)

  const { data, error } = await supabase
    .from('deleted_clients_log')
    .select('*')
    .order('deleted_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let records = data ?? []
  if (phoneFilter) {
    const target = normalizePhone(phoneFilter)
    records = records.filter(r => normalizePhone(r.phone).includes(target) || target.includes(normalizePhone(r.phone)))
  }

  return NextResponse.json({ records: records.slice(0, limit) })
}
