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

// POST /api/kiosk/action
// body: { action: 'checkin' | 'checkout', appointmentId: string }
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { action, appointmentId, paymentMethod, tipAmount } = await req.json()

  if (!action || !appointmentId) {
    return NextResponse.json({ error: 'action and appointmentId required' }, { status: 400 })
  }

  if (action === 'checkin') {
    const checkinNow = new Date().toISOString()
    // Single update: works for both pending and confirmed appointments.
    // Promotes pending → confirmed and sets grooming_status to 'waiting'.
    // Will not override appointments already past 'waiting' (in_progress, ready, done).
    const { data: updatedRows, error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'confirmed',
        grooming_status: 'waiting',
        grooming_status_updated_at: checkinNow,
        checked_in_at: checkinNow,
      })
      .eq('id', appointmentId)
      .in('status', ['pending', 'confirmed'])
      // NULL grooming_status also qualifies — using OR to handle SQL NULL != x = NULL (not TRUE)
      .or('grooming_status.is.null,grooming_status.not.in.(in_progress,incare,ready,done)')
      .select('id')

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // The guard above intentionally no-ops (with no error) when an appointment
    // already moved past check-in — that's fine, it's already checked in. But if
    // it's STILL not checked in and the guard blocked the update anyway (status
    // drifted to something unexpected), that used to come back as a plain
    // success:true, so the kiosk would tell the customer "you're checked in!"
    // while checked_in_at silently stayed blank. Catch that case explicitly.
    if (!updatedRows || updatedRows.length === 0) {
      const { data: existing } = await supabase
        .from('appointments')
        .select('checked_in_at')
        .eq('id', appointmentId)
        .single()
      if (!existing?.checked_in_at) {
        return NextResponse.json({ error: 'Could not check in — please see the front desk' }, { status: 409 })
      }
    }

    // Create dog_checkin record (ignore duplicate key errors — already checked in)
    const { error: checkinError } = await supabase.from('dog_checkins').insert({
      appointment_id: appointmentId,
      status: 'checked_in',
      updated_by: 'kiosk',
    })

    if (checkinError && !checkinError.code?.includes('23505')) {
      console.warn('dog_checkins insert warning:', checkinError.message)
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'checkout') {
    // Mark appointment completed + move to "Checked Out" in grooming pipeline
    const checkoutNow = new Date().toISOString()
    const checkoutUpdate: Record<string, string | null> = {
      status: 'completed',
      grooming_status: 'done',
      grooming_status_updated_at: checkoutNow,
      checked_out_at: checkoutNow,
    }

    if (tipAmount !== null && tipAmount !== undefined) {
      checkoutUpdate.tip_amount = String(tipAmount)
    }

    if (paymentMethod === 'card') {
      // Card — mark as paid immediately
      checkoutUpdate.payment_method = paymentMethod
      checkoutUpdate.payment_status = 'paid'

      const { error } = await supabase
        .from('appointments')
        .update(checkoutUpdate)
        .eq('id', appointmentId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (paymentMethod === 'venmo' || paymentMethod === 'zelle') {
      // Venmo / Zelle — mark as pending; front desk confirms after verifying
      checkoutUpdate.payment_method = paymentMethod
      checkoutUpdate.payment_status = `${paymentMethod}_pending`

      const { error } = await supabase
        .from('appointments')
        .update(checkoutUpdate)
        .eq('id', appointmentId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Cash — cashier may have already confirmed payment; don't overwrite 'paid' back to 'cash_pending'
      checkoutUpdate.payment_method = paymentMethod || 'cash'
      const { error } = await supabase
        .from('appointments')
        .update(checkoutUpdate)
        .eq('id', appointmentId)
        .neq('payment_status', 'paid')   // skip update if cashier already marked paid
      // Also run a separate update that always sets the completion fields (ignore payment_status)
      await supabase
        .from('appointments')
        .update({ status: 'completed', grooming_status: 'done', grooming_status_updated_at: checkoutNow, checked_out_at: checkoutNow })
        .eq('id', appointmentId)
        .eq('payment_status', 'paid')    // for already-paid cash appts, just finalize status
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update dog_checkin to checked_out
    await supabase
      .from('dog_checkins')
      .update({ status: 'checked_out', updated_at: new Date().toISOString(), updated_by: 'kiosk' })
      .eq('appointment_id', appointmentId)

    return NextResponse.json({ success: true })
  }

  // cash-pending: client chose cash on kiosk — signals cashier to collect
  if (action === 'cash-pending') {
    const { error } = await supabase
      .from('appointments')
      .update({ payment_method: 'cash', payment_status: 'cash_pending' })
      .eq('id', appointmentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
