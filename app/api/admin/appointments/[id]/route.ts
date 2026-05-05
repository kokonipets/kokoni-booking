import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyClientConfirmed, notifyClientRescheduled, notifyClientGroomingReady } from '@/lib/sms'
import { sendPushToStaff } from '@/lib/push-notify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Fire-and-forget wrapper — never throws
function pushToStaff(staffName: string, title: string, body: string) {
  sendPushToStaff(staffName, title, body).catch(() => {})
}

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
  const body = await req.json()
  const { action } = body
  const id = context.params.id

  if (action === 'confirm') {
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Fetch appointment details for SMS
    const { data: appt } = await supabase
      .from('appointments')
      .select('appointment_date, appointment_time, client_phone, clients(name, sms_consent), pets!pet_id(name)')
      .eq('id', id)
      .single()

    if (appt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = appt as any
      const clientName: string = a.clients?.name ?? 'there'
      const petName: string = a.pets?.name ?? 'your pet'
      const date = new Date(a.appointment_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const time: string = a.appointment_time

      // Only send client SMS if client opted in (A2P 10DLC compliance)
      if (a.clients?.sms_consent) {
        notifyClientConfirmed({
          to: a.client_phone,
          clientName,
          petName,
          date,
          time,
        }).catch((e: unknown) => console.error('SMS failed:', e))
      }
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'decline') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // Mark as no-show: set appointment status + increment client's no_show_count
  if (action === 'no-show') {
    const { data: appt, error: fetchErr } = await supabase
      .from('appointments')
      .select('client_phone')
      .eq('id', id)
      .single()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const { error: apptErr } = await supabase
      .from('appointments')
      .update({ status: 'no_show', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 })

    // Increment no_show_count on client record
    if (appt?.client_phone) {
      const { data: client } = await supabase
        .from('clients')
        .select('no_show_count')
        .eq('phone', appt.client_phone)
        .single()
      const newCount = ((client?.no_show_count as number) || 0) + 1
      await supabase.from('clients').update({ no_show_count: newCount }).eq('phone', appt.client_phone)
    }

    return NextResponse.json({ success: true })
  }

  // Cancel (same-day cancellation by staff)
  if (action === 'cancel-today') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'start') {
    const now = new Date().toISOString()
    // Use grooming_status pipeline (same as kiosk check-in)
    await supabase.from('appointments').update({ status: 'confirmed', grooming_status: 'waiting', grooming_status_updated_at: now, checked_in_at: now }).eq('id', id).eq('status', 'pending')
    const { error } = await supabase.from('appointments').update({ grooming_status: 'waiting', grooming_status_updated_at: now, checked_in_at: now }).eq('id', id).is('grooming_status', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'complete') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Update grooming notes
  if (action === 'update-notes') {
    const { notes, notes_chinese, notes_english, notes_author, notes_updated_at } = body
    const updates: Record<string, string | null> = {}
    if (notes !== undefined) updates.notes = notes
    if (notes_chinese !== undefined) updates.notes_chinese = notes_chinese
    if (notes_english !== undefined) updates.notes_english = notes_english

    // Try with author/timestamp fields first; fall back to just notes if columns don't exist
    if (notes_author !== undefined) updates.notes_author = notes_author
    if (notes_updated_at !== undefined) updates.notes_updated_at = notes_updated_at

    let { error } = await supabase.from('appointments').update(updates).eq('id', id)

    // If failed (likely because notes_author/notes_updated_at columns don't exist yet), retry without them
    if (error && (error.message.includes('notes_author') || error.message.includes('notes_updated_at'))) {
      const { notes: n, notes_chinese: nc, notes_english: ne } = updates
      const safeUpdates: Record<string, string | null> = {}
      if (n !== undefined) safeUpdates.notes = n
      if (nc !== undefined) safeUpdates.notes_chinese = nc
      if (ne !== undefined) safeUpdates.notes_english = ne
      const retry = await supabase.from('appointments').update(safeUpdates).eq('id', id)
      error = retry.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update-service') {
    const { service } = body
    if (!service) return NextResponse.json({ error: 'service required' }, { status: 400 })
    const { error } = await supabase.from('appointments').update({ service }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update-status') {
    const { status } = body
    if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })
    const updates: Record<string, string | null> = { status }
    if (status === 'confirmed') updates.confirmed_at = new Date().toISOString()
    const { error } = await supabase.from('appointments').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Reschedule appointment — reset to pending so groomer must re-accept
  if (action === 'reschedule') {
    const { appointment_date, appointment_time } = body
    if (!appointment_date || !appointment_time) {
      return NextResponse.json({ error: 'Date and time required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('appointments')
      .update({ appointment_date, appointment_time, status: 'pending', groomer_confirmed: false })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch appointment for SMS + push
    const { data: appt } = await supabase
      .from('appointments')
      .select('client_phone, assigned_groomer, assigned_bather, clients(name, sms_consent), pets!pet_id(name)')
      .eq('id', id)
      .single()

    if (appt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = appt as any
      const date = new Date(appointment_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const petName: string = a.pets?.name ?? 'your pet'
      // Only send client SMS if client opted in (A2P 10DLC compliance)
      if (a.clients?.sms_consent) {
        notifyClientRescheduled({
          to: a.client_phone,
          clientName: a.clients?.name ?? 'there',
          petName,
          date,
          time: appointment_time,
        }).catch((e: unknown) => console.error('Reschedule SMS failed:', e))
      }

      // Push notification to assigned groomer / bather
      const pushMsg = `${petName} · ${date} · ${appointment_time}`
      if (a.assigned_groomer) pushToStaff(a.assigned_groomer, 'Rescheduled 🔄', pushMsg)
      if (a.assigned_bather && a.assigned_bather !== a.assigned_groomer) pushToStaff(a.assigned_bather, 'Rescheduled 🔄', pushMsg)
    }

    return NextResponse.json({ success: true })
  }

  // Groomer accepts assignment — sets groomer_confirmed = true, clears rescheduled flag
  if (action === 'groomer-accept') {
    const { error } = await supabase
      .from('appointments')
      .update({ groomer_confirmed: true })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Groomer declines assignment — clears their name from the appointment
  if (action === 'groomer-decline') {
    const { groomer_name } = body
    // Fetch current assignment to know which field to clear
    const { data: current } = await supabase
      .from('appointments')
      .select('assigned_groomer, assigned_bather')
      .eq('id', id)
      .single()
    const updates: Record<string, null | boolean> = { groomer_confirmed: false }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = current as any
    if (c?.assigned_groomer === groomer_name) updates.assigned_groomer = null
    if (c?.assigned_bather === groomer_name) updates.assigned_bather = null
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Change service
  if (action === 'change-service') {
    const { service } = body
    if (!service) return NextResponse.json({ error: 'Service required' }, { status: 400 })
    const { error } = await supabase
      .from('appointments')
      .update({ service })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Assign groomer/bather
  if (action === 'assign-staff') {
    const { assigned_groomer, assigned_bather } = body
    const updates: Record<string, string | null | boolean> = {}
    if (assigned_groomer !== undefined) updates.assigned_groomer = assigned_groomer || null
    if (assigned_bather !== undefined) updates.assigned_bather = assigned_bather || null
    // Always reset groomer_confirmed so the newly assigned groomer must re-accept
    updates.groomer_confirmed = false
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Push notification to newly assigned staff
    const { data: apptInfo } = await supabase
      .from('appointments')
      .select('appointment_date, appointment_time, pets!pet_id(name)')
      .eq('id', id)
      .single()
    if (apptInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = apptInfo as any
      const petName: string = info.pets?.name ?? 'a pet'
      const date = new Date(info.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const pushMsg = `${petName} · ${date} · ${info.appointment_time}`
      if (assigned_groomer) pushToStaff(assigned_groomer, 'New appointment 🐾', pushMsg)
      if (assigned_bather && assigned_bather !== assigned_groomer) pushToStaff(assigned_bather, 'New appointment 🐾', pushMsg)
    }

    return NextResponse.json({ success: true })
  }

  // Add a note to notes_list
  if (action === 'add-note') {
    const { note } = body // { id, text, notes_english, notes_chinese, author, created_at }
    if (!note) return NextResponse.json({ error: 'note required' }, { status: 400 })

    // Fetch current notes_list
    const { data: existing } = await supabase
      .from('appointments')
      .select('notes_list')
      .eq('id', id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current: any[] = (existing as any)?.notes_list ?? []
    const updated = [...current, note]

    const { error } = await supabase
      .from('appointments')
      .update({ notes_list: updated })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, notes_list: updated })
  }

  // Delete a single note from notes_list by id
  if (action === 'delete-note') {
    const { noteId } = body
    if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('appointments')
      .select('notes_list')
      .eq('id', id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current: any[] = (existing as any)?.notes_list ?? []
    const updated = current.filter((n: { id: string }) => n.id !== noteId)

    const { error } = await supabase
      .from('appointments')
      .update({ notes_list: updated })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, notes_list: updated })
  }

  // Update text of an existing note in notes_list by id
  if (action === 'update-note') {
    const { noteId, text } = body
    if (!noteId || !text) return NextResponse.json({ error: 'noteId and text required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('appointments')
      .select('notes_list')
      .eq('id', id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current: any[] = (existing as any)?.notes_list ?? []
    const updated = current.map((n: { id: string }) => n.id === noteId ? { ...n, text } : n)

    const { error } = await supabase
      .from('appointments')
      .update({ notes_list: updated })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, notes_list: updated })
  }

  // Update translations of an existing note in notes_list by id
  if (action === 'update-note-translations') {
    const { noteId, notes_english, notes_chinese } = body
    if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

    // Legacy customer note lives directly on appointments.notes/notes_english/notes_chinese
    if (noteId === '__legacy__') {
      const { error } = await supabase
        .from('appointments')
        .update({ notes_english, notes_chinese })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    const { data: existing } = await supabase
      .from('appointments')
      .select('notes_list')
      .eq('id', id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current: any[] = (existing as any)?.notes_list ?? []
    const updated = current.map((n: { id: string }) => n.id === noteId ? { ...n, notes_english, notes_chinese } : n)

    const { error } = await supabase
      .from('appointments')
      .update({ notes_list: updated })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, notes_list: updated })
  }

  // Update grooming pipeline status
  if (action === 'grooming-status') {
    const { grooming_status, health_check, grooming_quality } = body
    if (!grooming_status) return NextResponse.json({ error: 'grooming_status required' }, { status: 400 })

    console.log('grooming-status action:', { grooming_status, health_check, grooming_quality, appointmentId: id })

    const now = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      grooming_status,
      grooming_status_updated_at: now,
    }
    // Stamp grooming_started_at the first time a groomer starts working
    if (grooming_status === 'incare') {
      updates.grooming_started_at = now
      // If health_check data is provided (initial assessment), save it
      if (health_check) {
        updates.health_check = health_check
        updates.health_check_completed_at = now
      }
    }
    // Stamp grooming_finished_at when grooming is complete (moved to ready)
    if (grooming_status === 'ready') {
      updates.grooming_finished_at = now
      // If quality check data is provided, save it
      if (grooming_quality) {
        updates.grooming_quality = grooming_quality
        updates.grooming_quality_completed_at = now
      }
    }
    // Stamp checked_out_at when manually advanced to done (kiosk also sets this)
    // Also mark status='completed' so cashier dashboard and earnings pick it up
    if (grooming_status === 'done') {
      updates.checked_out_at = now
      updates.status = 'completed'
    }
    // If moving BACKWARDS from done (undo checkout), reset status to confirmed
    // so the appointment is no longer flagged as completed while still in-salon
    if (grooming_status === 'waiting' || grooming_status === 'incare' || grooming_status === 'ready') {
      updates.status = 'confirmed'
    }

    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-send SMS when pet is ready to pick up
    if (grooming_status === 'ready') {
      const { data: appt } = await supabase
        .from('appointments')
        .select('client_phone, clients(name, sms_consent), pets!pet_id(name)')
        .eq('id', id)
        .single()

      if (appt) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = appt as any
        // Only send client SMS if client opted in (A2P 10DLC compliance)
        if (a.clients?.sms_consent) {
          notifyClientGroomingReady({
            to: a.client_phone,
            clientName: a.clients?.name ?? 'there',
            petName: a.pets?.name ?? 'your pet',
          }).catch((e: unknown) => console.error('Grooming ready SMS failed:', e))
        }
        // Stamp owner_notified_at after SMS dispatch
        await supabase.from('appointments').update({ owner_notified_at: now }).eq('id', id)
      }
    }

    return NextResponse.json({ success: true })
  }

  // Delete legacy note (clear old notes fields)
  if (action === 'delete-legacy-note') {
    const { error } = await supabase
      .from('appointments')
      .update({ notes: null, notes_english: null, notes_chinese: null, notes_author: null, notes_updated_at: null })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Record payment
  if (action === 'record-payment') {
    const { payment_amount, tip_amount, payment_method, payment_status, addons } = body
    const updates: Record<string, unknown> = {}
    if (payment_amount !== undefined) updates.payment_amount = payment_amount || null
    if (tip_amount !== undefined) updates.tip_amount = tip_amount || null
    if (payment_method !== undefined) updates.payment_method = payment_method || null
    if (payment_status !== undefined) updates.payment_status = payment_status

    // If addons array is provided, merge it into notes_list (replace any existing is_addon entries)
    if (Array.isArray(addons)) {
      const { data: existing } = await supabase
        .from('appointments')
        .select('notes_list')
        .eq('id', id)
        .single()
      const currentNotes: { id: string; text: string; author?: string; price?: string; is_addon?: boolean }[] =
        (existing as { notes_list?: unknown })?.notes_list as typeof currentNotes ?? []
      const nonAddonNotes = currentNotes.filter(n => !n.is_addon)
      const addonNotes = (addons as { id: string; name: string; price: string }[]).map(a => ({
        id: a.id,
        text: a.name,
        price: a.price,
        is_addon: true,
        author: 'system',
        created_at: new Date().toISOString(),
      }))
      updates.notes_list = [...nonAddonNotes, ...addonNotes]
    }

    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', context.params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
