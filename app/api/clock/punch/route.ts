import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Action = 'clock_in' | 'clock_out' | 'break_start' | 'break_end'

// POST /api/clock/punch
// Body: { pin: string, action?: Action }
// If action is omitted, the next logical action is inferred from the last punch.
// Returns: { success, staff: {id, name, role}, action, punched_at, currentStatus }
export async function POST(req: Request) {
  try {
    const { pin, action: requestedAction } = await req.json() as { pin?: string; action?: Action }
    if (!pin || !/^\d{3,8}$/.test(String(pin))) {
      return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 400 })
    }

    const sb = createSupabaseServer()

    // Look up staff by PIN
    const { data: staff, error: sErr } = await sb
      .from('staff')
      .select('id, name, role, is_active')
      .eq('clock_pin', String(pin))
      .maybeSingle()

    if (sErr) return NextResponse.json({ success: false, error: sErr.message }, { status: 500 })
    if (!staff) return NextResponse.json({ success: false, error: 'PIN not recognized' }, { status: 404 })
    if (staff.is_active === false) {
      return NextResponse.json({ success: false, error: 'Account inactive' }, { status: 403 })
    }

    // Fetch last punch today for this staff to infer current status
    const { data: recent } = await sb
      .from('time_punches')
      .select('action, punched_at')
      .eq('staff_id', staff.id)
      .order('punched_at', { ascending: false })
      .limit(1)

    const lastAction = recent?.[0]?.action as Action | undefined
    const currentStatus = deriveStatus(lastAction)

    // Infer next action if not provided
    let action: Action
    if (requestedAction) {
      action = requestedAction
    } else {
      action = nextAction(currentStatus)
    }

    // Validate transition
    if (!isValidTransition(currentStatus, action)) {
      return NextResponse.json({
        success: false,
        error: `Cannot ${prettyAction(action)} while ${prettyStatus(currentStatus)}`,
        staff: { id: staff.id, name: staff.name, role: staff.role },
        currentStatus,
      }, { status: 409 })
    }

    // Insert punch
    const { data: punch, error: pErr } = await sb
      .from('time_punches')
      .insert({ staff_id: staff.id, action, source: 'kiosk' })
      .select('id, action, punched_at')
      .single()

    if (pErr) return NextResponse.json({ success: false, error: pErr.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      staff: { id: staff.id, name: staff.name, role: staff.role },
      action: punch.action,
      punched_at: punch.punched_at,
      currentStatus: deriveStatus(punch.action as Action),
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}

type Status = 'out' | 'in' | 'on_break'

function deriveStatus(action: Action | undefined): Status {
  switch (action) {
    case 'clock_in':
    case 'break_end':
      return 'in'
    case 'break_start':
      return 'on_break'
    case 'clock_out':
    default:
      return 'out'
  }
}

function nextAction(status: Status): Action {
  if (status === 'out') return 'clock_in'
  if (status === 'in') return 'clock_out'
  // on_break → end break
  return 'break_end'
}

function isValidTransition(status: Status, action: Action): boolean {
  if (action === 'clock_in') return status === 'out'
  if (action === 'clock_out') return status === 'in' || status === 'on_break'
  if (action === 'break_start') return status === 'in'
  if (action === 'break_end') return status === 'on_break'
  return false
}

function prettyAction(a: Action) {
  return ({ clock_in: 'clock in', clock_out: 'clock out', break_start: 'start break', break_end: 'end break' } as const)[a]
}
function prettyStatus(s: Status) {
  return ({ out: 'clocked out', in: 'clocked in', on_break: 'on break' } as const)[s]
}
