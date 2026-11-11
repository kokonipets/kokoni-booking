import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
import { checkBookableDate } from '@/lib/bookable-date'
import { notifyAdminNewRequest } from '@/lib/sms'
import { sendPushToAdmin } from '@/lib/push-notify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createSupabaseServer()

  const {
    phone,
    isNewClient,
    clientName,
    clientEmail,
    isNewPet,
    petId: existingPetId,
    petName,
    petBreed,
    petWeight,
    petBirthday,
    service,
    date,
    time,
    notes,
    tosAgreedAt,
    smsConsent,
    smsConsentAt,
    vaccineFileUrl,
    vaccineEmailOnly,
    vaccineSmsOnly,
    isWalkIn,
    anonymousWalkIn,
    anonDogName,
    groupId,
  } = body

  // Anonymous walk-in (quick services like Nail Trim): the customer doesn't want to leave
  // any info and waits on site, so everything books under ONE shared placeholder client and
  // ONE shared placeholder pet — no new client/pet rows pile up. The optional dog name goes
  // into the appointment notes. No vaccine record, no client SMS; admin gets a push only.
  if (isWalkIn && anonymousWalkIn) {
    try {
      const ANON_PHONE = '0000000000'
      await supabase.from('clients').upsert(
        { phone: ANON_PHONE, name: 'Walk-In Customer', sms_consent: false },
        { onConflict: 'phone', ignoreDuplicates: true }
      )
      let anonPetId: string | undefined
      const { data: existingPet } = await supabase
        .from('pets').select('id').eq('client_phone', ANON_PHONE).limit(1).maybeSingle()
      if (existingPet?.id) {
        anonPetId = existingPet.id
      } else {
        const { data: newPet, error: petErr } = await supabase
          .from('pets')
          .insert({ client_phone: ANON_PHONE, name: 'Walk-In', vaccine_status: 'verified' })
          .select('id').single()
        if (petErr) throw new Error(`Pet error: ${petErr.message}`)
        anonPetId = newPet.id
      }
      const dogName = typeof anonDogName === 'string' ? anonDogName.trim().slice(0, 40) : ''
      // Pre-fill the checkout amount from the service's price (e.g. Nail Trim = $15) so the
      // cashier opens already filled in. An empty/$0 payment is treated as a no-show by
      // record-payment, so a blank amount here would mislabel a real, paid nail trim.
      let anonAmount: string | null = null
      try {
        const { data: svcRow } = await supabase.from('salon_settings').select('value').eq('key', 'services').maybeSingle()
        const svcs: { id: string; price?: string; tiers?: { price?: string }[] }[] = svcRow?.value ? JSON.parse(svcRow.value) : []
        const svcDef = svcs.find(s => s.id === service)
        const rawPrice = parseFloat(String(svcDef?.price ?? svcDef?.tiers?.[0]?.price ?? ''))
        if (!isNaN(rawPrice) && rawPrice > 0) anonAmount = rawPrice.toFixed(2)
      } catch { anonAmount = null }
      const { data: appt, error: apptErr } = await supabase
        .from('appointments')
        .insert({
          client_phone: ANON_PHONE,
          pet_id: anonPetId,
          service,
          appointment_date: date,
          appointment_time: time,
          notes: dogName ? `Dog: ${dogName}` : null,
          payment_amount: anonAmount,
          status: 'confirmed',
          is_walk_in: true,
          tos_agreed_at: tosAgreedAt ?? new Date().toISOString(),
        })
        .select('id').single()
      if (apptErr) throw new Error(`Appointment error: ${apptErr.message}`)
      sendPushToAdmin(
        '🚶 Walk-In Checked In',
        `Walk-In Customer${dogName ? ` — ${dogName}` : ''} · ${String(service).replace(/_/g, ' ')} — here now`
      ).catch(() => {})
      return NextResponse.json({ success: true, id: appt.id, petId: anonPetId })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  // Defense-in-depth: never accept a booking on a closed day or blocked date,
  // even if the customer's page somehow offered it. Fails closed (see lib/bookable-date).
  {
    const check = await checkBookableDate(supabase, date)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  }

  let resolvedPetId = existingPetId

  try {
    // 1. Create client if new; update consent for returning clients who opt in
    if (isNewClient) {
      const { error: clientError } = await supabase.from('clients').upsert({
        phone,
        name: clientName,
        email: clientEmail || null,
        sms_consent: !!smsConsent,
        sms_consent_at: smsConsent ? (smsConsentAt ?? new Date().toISOString()) : null,
      })
      if (clientError) throw new Error(`Client error: ${clientError.message}`)
    } else if (smsConsent) {
      // Returning client opted in — record consent if not already on file
      await supabase.from('clients')
        .update({
          sms_consent: true,
          sms_consent_at: smsConsentAt ?? new Date().toISOString(),
        })
        .eq('phone', phone)
        .eq('sms_consent', false)
    }

    // 2. Create pet if new
    if (isNewClient || isNewPet) {
      const { data: newPet, error: petError } = await supabase
        .from('pets')
        .insert({
          client_phone: phone,
          name: petName,
          breed: petBreed || null,
          weight: petWeight || null,
          birthday: petBirthday || null,
          vaccine_status: vaccineFileUrl ? 'pending' : (vaccineEmailOnly || vaccineSmsOnly) ? 'email_sent' : 'pending',
        })
        .select('id')
        .single()
      if (petError) throw new Error(`Pet error: ${petError.message}`)
      resolvedPetId = newPet.id

      // 3. Create a vaccination record for new clients/pets so admin can track them
      await supabase.from('vaccination_records').insert({
        pet_id: resolvedPetId,
        file_url: vaccineFileUrl || null,
        is_email_only: !!(vaccineEmailOnly || vaccineSmsOnly),
      })
    } else if (vaccineFileUrl || vaccineEmailOnly || vaccineSmsOnly) {
      // 3b. Returning customer uploaded a new vaccine file — create a record for it
      await supabase.from('vaccination_records').insert({
        pet_id: resolvedPetId,
        file_url: vaccineFileUrl || null,
        is_email_only: !!(vaccineEmailOnly || vaccineSmsOnly),
      })
    }

    // 4. Create appointment
    const apptFields: Record<string, unknown> = {
      client_phone: phone,
      pet_id: resolvedPetId,
      service,
      appointment_date: date,
      appointment_time: time,
      notes: notes || null,
      // Walk-ins are seen right away — no pending review step, they're already standing there.
      status: isWalkIn ? 'confirmed' : 'pending',
      is_walk_in: !!isWalkIn,
      tos_agreed_at: tosAgreedAt,
    }
    // Links this appointment to sibling appointments for other dogs the same client
    // booked together at (roughly) the same time — see supabase/migrations/
    // 20260910_add_group_id_to_appointments.sql. Only set when actually booking a
    // group, so an ordinary single-dog booking never depends on that column existing.
    if (groupId) apptFields.group_id = groupId

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .insert(apptFields)
      .select('id')
      .single()

    if (apptError) throw new Error(`Appointment error: ${apptError.message}`)

    // 4a. Promo link (e.g. /book?promo=DOUBLE11 from an announcement): if the
    // code matches an active coupon, remember it on the appointment so checkout
    // pre-selects that coupon. Best-effort — an unknown code, or the promo_code
    // column not migrated yet, never blocks the booking.
    let promoRaw = (body.promoCode as string | undefined) || req.cookies.get('kokoni_promo')?.value
    // No promo cookie (e.g. the client booked from the saved home-screen app,
    // or typed the address instead of tapping the link): if we texted this
    // client an announcement with a ?promo=CODE link in the last 14 days, the
    // offer was meant for them — use that code.
    if (!promoRaw && !anonymousWalkIn) {
      try {
        const ten = String(phone || '').replace(/\D/g, '').slice(-10)
        const since = new Date(Date.now() - 14 * 86400000).toISOString()
        const { data: recent } = await supabase
          .from('sms_messages')
          .select('body, created_at')
          .eq('direction', 'outbound')
          .eq('client_phone', ten)
          .ilike('body', '%promo=%')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
        const m = recent?.[0]?.body?.match(/promo=([A-Za-z0-9_-]+)/)
        if (m) promoRaw = m[1]
      } catch (e) {
        console.error('Promo lookup from recent texts failed (non-blocking):', e)
      }
    }
    const promoCode = (promoRaw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30)
    if (promoCode && appointment?.id && !anonymousWalkIn) {
      try {
        const { data: coupon } = await supabase
          .from('coupons')
          .select('code')
          .eq('active', true)
          .ilike('code', promoCode)
          .maybeSingle()
        // One use per client: skip if this client already has another (not
        // cancelled / no-show) booking with this promo on a different day.
        // Same-day bookings still get it, so a client bringing two dogs in
        // together gets the promo on both.
        let alreadyUsed = false
        if (coupon?.code) {
          const myDigits = String(phone || '').replace(/\D/g, '').slice(-10)
          const { data: prior } = await supabase
            .from('appointments')
            .select('id, client_phone, appointment_date, status')
            .ilike('promo_code', coupon.code)
          alreadyUsed = (prior ?? []).some(p =>
            p.id !== appointment.id &&
            String(p.client_phone || '').replace(/\D/g, '').slice(-10) === myDigits &&
            p.appointment_date !== date &&
            !['cancelled', 'no_show'].includes(String(p.status || '').toLowerCase())
          )
        }
        if (coupon?.code && !alreadyUsed) {
          const { error: promoErr } = await supabase.from('appointments').update({ promo_code: coupon.code }).eq('id', appointment.id)
          if (promoErr) console.warn('promo_code not saved (run promo migration?):', promoErr.message)
        }
      } catch (e) {
        console.error('Promo code lookup failed (non-blocking):', e)
      }
    }

    // 4b. Auto-translate customer notes (best-effort, don't block booking if it fails)
    if (notes && notes.trim() && appointment?.id) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
        const tRes = await fetch(`${baseUrl}/api/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: notes.trim() }),
        })
        const tData = await tRes.json()
        if (tData.english || tData.traditional) {
          await supabase.from('appointments').update({
            notes_english: tData.detected !== 'english' ? (tData.english || null) : null,
            notes_chinese: tData.detected !== 'traditional' ? (tData.traditional || null) : null,
            notes_author: 'Customer',
          }).eq('id', appointment.id)
        }
      } catch (e) {
        console.error('Auto-translate customer note failed (non-blocking):', e)
      }
    }

    // 5. Look up client name for SMS (returning clients)
    let displayName = clientName
    if (!isNewClient) {
      const { data: existing } = await supabase
        .from('clients')
        .select('name')
        .eq('phone', phone)
        .single()
      displayName = existing?.name ?? phone
    }

    // 6. Look up pet name for SMS (returning pets)
    let displayPetName = petName
    if (!isNewClient && !isNewPet) {
      const { data: pet } = await supabase
        .from('pets')
        .select('name')
        .eq('id', resolvedPetId)
        .single()
      displayPetName = pet?.name ?? 'Dog'
    }

    // 7. Notify admin via SMS — always fires regardless of client SMS consent
    // (admin notifications are internal; only client-facing messages require opt-in)
    notifyAdminNewRequest({
      clientName: displayName,
      petName: displayPetName,
      service,
      date,
      time,
      phone,
      smsConsent: !!smsConsent, // passed through for reference; admin SMS always sends
      isWalkIn: !!isWalkIn,
    }).catch((smsErr) => console.error('SMS notify failed:', smsErr))

    // Note: walk-ins deliberately get NO client-facing SMS at all (no "confirmed" text,
    // no reminder) — they're already standing in the store, so a text about their own
    // appointment doesn't apply to them. Only the admin notification below fires.

    // 8. Push notification to admin mobile devices
    sendPushToAdmin(
      isWalkIn ? '🚶 Walk-In Checked In' : '🦄 New Appointment Request',
      isWalkIn
        ? `${displayName} — ${displayPetName} · ${service.replace(/_/g, ' ')} — here now`
        : `${displayName} — ${displayPetName} · ${service.replace(/_/g, ' ')} on ${date} at ${time}`
    ).catch(() => {})

    return NextResponse.json({ id: appointment.id, petId: resolvedPetId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Appointment creation error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
