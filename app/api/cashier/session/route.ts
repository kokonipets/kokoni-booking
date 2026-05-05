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

// POST /api/cashier/session
// body: { action: 'start' | 'end', staff_id, staff_name, session_id? }
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { action, staff_id, staff_name, session_id } = await req.json()

  if (action === 'start') {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('cashier_sessions')
      .insert({
        staff_id,
        staff_name,
        date: today,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, session: data })
  }

  if (action === 'end' && session_id) {
    const { error } = await supabase
      .from('cashier_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', session_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// GET /api/cashier/session — recent sessions for record keeping
export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('cashier_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data })
}
