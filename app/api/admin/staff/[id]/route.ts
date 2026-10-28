import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ratesOn } from '@/lib/commission'

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
  const { is_active, first_name, last_name, name, role, phone, address, pay_type, hourly_rate, commission_percent, tip_percent, work_hours, days_off, special_hours, permissions, username, email, password, clock_pin, rates_effective_from, delete_rate_effective_from } = await req.json()
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

  // Remove one entry from the rate history (typo / wrong date). The baseline (original) entry can't be removed.
  // Afterwards the staff row's "current" rates are set to whatever is in force today.
  let recalculated: { commission_percent: number; tip_percent: number } | null = null
  const recalcCurrent = async () => {
    const { data: rows } = await supabase.from('staff_rate_history').select('effective_from, commission_percent, tip_percent').eq('staff_id', id)
    if (!rows || rows.length === 0) return
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const r = ratesOn({ rate_history: rows as { effective_from: string; commission_percent: number; tip_percent: number }[] }, today)
    updates.commission_percent = r.commission
    updates.tip_percent = r.tip
    recalculated = { commission_percent: r.commission, tip_percent: r.tip }
  }
  if (typeof delete_rate_effective_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(delete_rate_effective_from) && delete_rate_effective_from > '2001-01-01') {
    await supabase.from('staff_rate_history').delete().eq('staff_id', id).eq('effective_from', delete_rate_effective_from)
    await recalcCurrent()
  }

  // Record commission / tip-share changes with an effective date, so payroll for earlier days keeps the old rate.
  // First change ever: also store the OLD rates as a baseline that covers all earlier dates.
  if (commission_percent !== undefined || tip_percent !== undefined) {
    try {
      const { data: before } = await supabase.from('staff').select('commission_percent, tip_percent').eq('id', id).single()
      const oldC = Number(before?.commission_percent ?? 0), oldT = Number(before?.tip_percent ?? 0)
      const newC = commission_percent !== undefined ? Number(commission_percent) : oldC
      const newT = tip_percent !== undefined ? Number(tip_percent) : oldT
      if (before && (newC !== oldC || newT !== oldT)) {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
        const eff = typeof rates_effective_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rates_effective_from) ? rates_effective_from : today
        const { count } = await supabase.from('staff_rate_history').select('id', { count: 'exact', head: true }).eq('staff_id', id)
        if (!count) {
          await supabase.from('staff_rate_history').upsert({ staff_id: id, effective_from: '2000-01-01', commission_percent: oldC, tip_percent: oldT }, { onConflict: 'staff_id,effective_from' })
        }
        await supabase.from('staff_rate_history').upsert({ staff_id: id, effective_from: eff, commission_percent: newC, tip_percent: newT }, { onConflict: 'staff_id,effective_from' })
        await recalcCurrent()
      }
    } catch (e) { console.warn('staff_rate_history not recorded (run the staff_rate_history migration?):', e) }
  }

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
  return NextResponse.json({ success: true, ...(recalculated ?? {}) })
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
