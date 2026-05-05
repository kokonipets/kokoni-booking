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

export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}

export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { first_name, last_name, name, role, username, email, phone, address, password, pay_type, hourly_rate, commission_percent, tip_percent, work_hours, days_off, special_hours } = await req.json()

  if (!first_name?.trim()) return NextResponse.json({ error: 'First name is required' }, { status: 400 })
  if (!username?.trim()) return NextResponse.json({ error: 'Username is required' }, { status: 400 })
  if (!password?.trim()) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  const passwordHash = Buffer.from(password).toString('base64')

  const baseInsert = {
    first_name: first_name?.trim() || null,
    last_name: last_name?.trim() || null,
    name: name?.trim() || `${first_name || ''} ${last_name || ''}`.trim(),
    role: role || 'groomer',
    username: username.trim(),
    email: email?.trim() || null,
    password_hash: passwordHash,
    phone: phone || null,
    address: address || null,
    pay_type: pay_type || 'hourly',
    hourly_rate: hourly_rate ?? null,
    commission_percent: commission_percent || 0,
    tip_percent: tip_percent || 0,
    work_hours: work_hours || {},
    days_off: days_off || [],
    special_hours: special_hours || {},
    permissions: {}
  }

  let { data: staffData, error: staffError } = await supabase.from('staff').insert(baseInsert).select().single()

  // If DB is missing pay_type/hourly_rate columns, retry without them
  if (staffError?.message?.includes('hourly_rate') || staffError?.message?.includes('pay_type')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pay_type: _pt, hourly_rate: _hr, ...safeInsert } = baseInsert
    const retry = await supabase.from('staff').insert(safeInsert).select().single()
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
    staffData = retry.data
    staffError = null
  }

  if (staffError) return NextResponse.json({ error: staffError.message }, { status: 500 })
  return NextResponse.json({ staff: staffData })
}
