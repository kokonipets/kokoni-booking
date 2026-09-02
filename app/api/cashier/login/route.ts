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

// Logs a staff member into the standalone Cashier screen and records the
// sign-in event (who + when) so Admin/Desk can show a "who's been on
// register" history. Separate from /api/auth/login (which gates Admin/Desk
// and the Groomer dashboard) — any active staff member's own credentials
// work here, regardless of their role, since covering the register isn't
// tied to one role.
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, first_name, last_name, role, username, password_hash, is_active')
    .ilike('username', username.trim())
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  if (!staff.is_active) {
    return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 401 })
  }

  const passwordHash = Buffer.from(password).toString('base64')
  if (staff.password_hash !== passwordHash) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const displayName = staff.first_name
    ? `${staff.first_name} ${staff.last_name || ''}`.trim()
    : staff.name

  // Best-effort: record the sign-in event, but don't block the actual login
  // if the cashier_logins table hasn't been migrated yet.
  const { error: logErr } = await supabase
    .from('cashier_logins')
    .insert({ staff_id: staff.id, staff_name: displayName })
  if (logErr) console.warn('cashier_logins not recorded (run cashier_logins migration?):', logErr.message)

  return NextResponse.json({
    success: true,
    user: { id: staff.id, name: displayName, role: staff.role, username: staff.username },
  })
}

// Returns recent Cashier sign-ins (most recent first) for Admin/Desk's
// "who's been on register" activity log.
export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('cashier_logins')
    .select('id, staff_name, logged_in_at')
    .order('logged_in_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ logins: [] })
  return NextResponse.json({ logins: data || [] })
}
