import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
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
  } = body

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
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .insert({
        client_phone: phone,
        pet_id: resolvedPetId,
        service,
        appointment_date: date,
        appointment_time: time,
        notes: notes || null,
        status: 'pending',
        tos_agreed_at: tosAgreedAt,
      })
      .select('id')
      .single()

    if (apptError) throw new Error(`Appointment error: ${apptError.message}`)

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
    }).catch((smsErr) => console.error('SMS notify failed:', smsErr))

    // 8. Push notification to admin mobile devices
    sendPushToAdmin(
      '🦄 New Appointment Request',
      `${displayName} — ${displayPetName} · ${service.replace(/_/g, ' ')} on ${date} at ${time}`
    ).catch(() => {})

    return NextResponse.json({ id: appointment.id, petId: resolvedPetId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Appointment creation error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
