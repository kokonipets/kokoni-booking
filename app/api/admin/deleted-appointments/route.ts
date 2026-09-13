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

// GET /api/admin/deleted-appointments?limit=200
// Browse the snapshot log left behind whenever an admin deleted an appointment
// (see supabase/migrations/20260913_add_deleted_appointments_log.sql). Returns
// an empty list rather than an error if that table hasn't been migrated in
// yet, so the admin UI can show "no deleted appointments" instead of breaking.
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 1000)

  const { data, error } = await supabase
    .from('deleted_appointments_log')
    .select('*')
    .order('deleted_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ records: [] })
  return NextResponse.json({ records: data ?? [] })
}
