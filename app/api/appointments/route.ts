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

  // Defense-in-depth: never accept a booking on a closed day or blocked date,
  // even if the customer's page somehow offered it (e.g. settings didn't load).
  if (date) {
    const { data: settingRows } = await supabase
      .from('salon_settings')
      .select('key, value')
      .in('key', ['open_days', 'blocked_dates_list'])
    const settings: Record<string, string> = {}
    for (const r of (settingRows ?? []) as { key: string; value: string }[]) settings[r.key] = r.value
    let openDays: number[] | null = null
    try { if (settings.open_days) openDays = JSON.parse(settings.open_days) } catch { openDays = null }
    let blockedDates: string[] = []
    try {
      const list = settings.blocked_dates_list ? JSON.parse(settings.blocked_dates_list) : []
      blockedDates = list.map((b: { date: string }) => b.date)
    } catch { blockedDates = [] }

    // The booking pages send the date as "M/D/YYYY" (e.g. "6/28/2026"); other
    // callers may send ISO "YYYY-MM-DD". Parse both into a local-noon Date (no
    // timezone shift) and a normalized ISO string for the blocked-list check.
    let dt: Date | null = null
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [mm, dd, yy] = date.split('/').map(Number)
      dt = new Date(yy, mm - 1, dd, 12)
    } else if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      const [yy, mm, dd] = date.slice(0, 10).split('-').map(Number)
      dt = new Date(yy, mm - 1, dd, 12)
    }
    // Only enforce when we could actually parse the date (never reject on an
    // unrecognized format — that would block legitimate bookings).
    if (dt && !isNaN(dt.getTime())) {
      const dow = dt.getDay() // 0=Sun … 6=Sat
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      if ((openDays && !openDays.includes(dow)) || blockedDates.includes(iso)) {
        return NextResponse.json(
          { error: 'Sorry, that date is not available for booking. Please pick another day.' },
          { status: 400 }
        )
      }
    }
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
