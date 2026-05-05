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

export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const supabase = getAdminClient()
  const { is_active, first_name, last_name, name, role, phone, address, pay_type, hourly_rate, commission_percent, tip_percent, work_hours, days_off, special_hours, permissions, username, email, password, clock_pin } = await req.json()
  const id = context.params.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (first_name !== undefined) updates.first_name = first_name?.trim() || null
  if (last_name !== undefined) updates.last_name = last_name?.trim() || null
  if (name) updates.name = name.trim()
  if (role) updates.role = role
  if (phone !== undefined) updates.phone = phone || null
  if (address !== undefined) updates.address = address || null
  if (pay_type !== undefined) updates.pay_type = pay_type
  if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate
  if (commission_percent !== undefined) updates.commission_percent = commission_percent
  if (tip_percent !== undefined) updates.tip_percent = tip_percent
  if (work_hours !== undefined) updates.work_hours = work_hours
  if (days_off !== undefined) updates.days_off = days_off
  if (special_hours !== undefined) updates.special_hours = special_hours
  if (permissions !== undefined) updates.permissions = permissions
  if (clock_pin !== undefined) {
    const trimmed = typeof clock_pin === 'string' ? clock_pin.trim() : ''
    updates.clock_pin = trimmed ? trimmed : null
  }

  // Save credentials directly on staff table
  if (username) updates.username = username.trim()
  if (email !== undefined) updates.email = email?.trim() || null
  if (password) updates.password_hash = Buffer.from(password).toString('base64')

  let { error } = await supabase.from('staff').update(updates).eq('id', id)

  // If DB is missing pay_type/hourly_rate columns (migration not yet applied), retry without them
  if (error?.message?.includes('hourly_rate') || error?.message?.includes('pay_type')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pay_type: _pt, hourly_rate: _hr, ...safeUpdates } = updates
    const retry = await supabase.from('staff').update(safeUpdates).eq('id', id)
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
    error = null
  }

  // If DB is missing clock_pin column (migration not yet applied), retry without it
  if (error?.message?.includes('clock_pin')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clock_pin: _cp, ...safeUpdates } = updates
    const retry = await supabase.from('staff').update(safeUpdates).eq('id', id)
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
    error = null
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const supabase = getAdminClient()
  const { error } = await supabase.from('staff').delete().eq('id', context.params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
