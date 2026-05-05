import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/clock/status
// Returns current status ("in" | "on_break" | "out") for every active staff member,
// plus the timestamp of their most recent punch.
export async function GET() {
  const sb = createSupabaseServer()

  const { data: staff, error: sErr } = await sb
    .from('staff')
    .select('id, name, role, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  // Fetch latest punch per staff via a window-style query
  // Pull last 30 days of punches and reduce client-side (keeps it simple/portable)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: punches } = await sb
    .from('time_punches')
    .select('staff_id, action, punched_at')
    .gte('punched_at', since)
    .order('punched_at', { ascending: false })

  const latestByStaff = new Map<string, { action: string; punched_at: string }>()
  for (const p of punches ?? []) {
    if (!latestByStaff.has(p.staff_id)) {
      latestByStaff.set(p.staff_id, { action: p.action, punched_at: p.punched_at })
    }
  }

  const rows = (staff ?? []).map(s => {
    const last = latestByStaff.get(s.id)
    const status = deriveStatus(last?.action)
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      status,
      last_action: last?.action ?? null,
      last_punched_at: last?.punched_at ?? null,
    }
  })

  return NextResponse.json({ staff: rows })
}

function deriveStatus(action: string | undefined) {
  if (action === 'clock_in' || action === 'break_end') return 'in'
  if (action === 'break_start') return 'on_break'
  return 'out'
}
