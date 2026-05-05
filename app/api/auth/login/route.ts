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

export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  // Find staff member by username directly on staff table
  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, first_name, last_name, role, username, email, password_hash, permissions, commission_percent, tip_percent, is_active')
    .ilike('username', username.trim())
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  if (!staff.is_active) {
    return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 401 })
  }

  // Verify password
  const passwordHash = Buffer.from(password).toString('base64')
  if (staff.password_hash !== passwordHash) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const displayName = staff.first_name
    ? `${staff.first_name} ${staff.last_name || ''}`.trim()
    : staff.name

  return NextResponse.json({
    success: true,
    user: {
      id: staff.id,
      staff_id: staff.id,
      name: displayName,
      role: staff.role,
      username: staff.username,
      email: staff.email,
      permissions: staff.permissions || {},
      commission_percent: staff.commission_percent || 0,
      tip_percent: staff.tip_percent || 0,
    }
  })
}
