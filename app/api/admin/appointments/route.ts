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

// `*` keeps this resilient to optional columns (e.g. discount_* fields) that may
// not be migrated yet — Supabase returns whatever columns exist.
const SELECT_FIELDS = `
  *,
  clients (
    name,
    phone,
    email
  ),
  pets!pet_id (
    id,
    name,
    breed,
    weight,
    vaccine_status,
    photo_url
  )
`

// Extra timeline columns only used by the Today tab — require SQL migrations:
// ALTER TABLE appointments ADD COLUMN IF NOT EXISTS grooming_started_at TIMESTAMPTZ;
// ALTER TABLE appointments ADD COLUMN IF NOT EXISTS grooming_finished_at TIMESTAMPTZ;
// ALTER TABLE appointments ADD COLUMN IF NOT EXISTS owner_notified_at TIMESTAMPTZ;
// ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
// ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
// (kept for reference; covered by `*` now): grooming_started_at, grooming_finished_at, owner_notified_at, checked_out_at, checked_in_at

// "Today" (YYYY-MM-DD) in the salon's timezone (Pacific). The server runs in
// UTC, so new Date() alone would flip to the next day at 4-5 PM LA time.
// Before 4 AM LA counts as the previous business day.
function salonToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const hour = +(g('hour') === '24' ? '0' : g('hour'))
  const d = new Date(+g('year'), +g('month') - 1, +g('day'))
  if (hour < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const today = salonToday()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any

  if (status === 'pending') {
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .eq('status', 'pending')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
  } else if (status === 'requests') {
    // All upcoming pending + confirmed + rescheduled appointments (for Pending Request tab)
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .gte('appointment_date', today)
      .in('status', ['pending', 'confirmed', 'rescheduled'])
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    // Detect first-time visits
    if (!result.error && result.data?.length) {
      const phones = [...new Set(result.data.map((a: { client_phone: string }) => a.client_phone))]
      const { data: allAppts } = await supabase
        .from('appointments')
        .select('client_phone, appointment_date')
        .in('client_phone', phones)
        .not('status', 'eq', 'cancelled')
        .order('appointment_date', { ascending: true })
      const firstDateByPhone: Record<string, string> = {}
      for (const a of (allAppts || [])) {
        if (!firstDateByPhone[a.client_phone] || a.appointment_date < firstDateByPhone[a.client_phone]) {
          firstDateByPhone[a.client_phone] = a.appointment_date
        }
      }
      result = {
        ...result,
        data: result.data.map((a: { client_phone: string; appointment_date: string }) => ({
          ...a,
          is_new_client: firstDateByPhone[a.client_phone] === a.appointment_date,
        })),
      }
    }
  } else if (status === 'today') {
    // Optional ?date=YYYY-MM-DD lets the Today view browse past days (history).
    const dayDate = searchParams.get('date') || today
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS) // `*` already includes the timeline columns (TODAY_EXTRA_FIELDS)
      .eq('appointment_date', dayDate)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('appointment_time', { ascending: true })
  } else if (status === 'upcoming') {
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .gte('appointment_date', today)
      .eq('status', 'confirmed')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
  } else if (status === 'month') {
    const month = searchParams.get('month') || today.slice(0, 7)
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate() // 0th day of next month = last day of this month
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .gte('appointment_date', month + '-01')
      .lte('appointment_date', month + '-' + String(lastDay).padStart(2, '0'))
      .in('status', ['pending', 'confirmed', 'in_progress', 'completed'])
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    if (!result.error && result.data?.length) {
      // Detect first-time visits: mark only the appointment that is the client's earliest EVER
      const phones = [...new Set(result.data.map((a: { client_phone: string }) => a.client_phone))]
      const { data: allAppts } = await supabase
        .from('appointments')
        .select('client_phone, appointment_date')
        .in('client_phone', phones)
        .not('status', 'eq', 'cancelled')
        .order('appointment_date', { ascending: true })

      // Find the earliest appointment date per client across all time
      const firstDateByPhone: Record<string, string> = {}
      for (const a of (allAppts || [])) {
        if (!firstDateByPhone[a.client_phone] || a.appointment_date < firstDateByPhone[a.client_phone]) {
          firstDateByPhone[a.client_phone] = a.appointment_date
        }
      }

      result = {
        ...result,
        data: result.data.map((a: { client_phone: string; appointment_date: string }) => ({
          ...a,
          // First visit only if this appointment's date is the client's earliest date ever
          is_new_client: firstDateByPhone[a.client_phone] === a.appointment_date,
        })),
      }
    }
  } else if (status === 'client') {
    // All appointments for a given clientPhone (for detail panel future appts)
    const clientPhone = searchParams.get('clientPhone')
    const today = salonToday()
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .eq('client_phone', clientPhone ?? '')
      .gte('appointment_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
  } else {
    result = await supabase
      .from('appointments')
      .select(SELECT_FIELDS)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: true })
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  return NextResponse.json({ appointments: result.data })
}

// POST /api/admin/appointments — admin quick-add appointment
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { phone, clientName, email, petId, petName, breed, weight, vaccineStatus, service, date, time } = await req.json()

  if (!phone || !service || !date || !time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Check if client already exists
  const { data: existingClient } = await supabase
    .from('clients')
    .select('phone')
    .eq('phone', phone)
    .maybeSingle()
  const isNewClient = !existingClient

  // Upsert client — never overwrite an existing client's saved name/email with blanks.
  // Only columns present in the payload are written, so omitting name/email for an
  // existing client leaves their stored values untouched. A brand-new client falls
  // back to the phone number so the row always has a name.
  const clientFields: Record<string, string> = { phone }
  if (clientName?.trim()) {
    clientFields.name = clientName.trim()
  } else if (isNewClient) {
    clientFields.name = phone
  }
  if (email?.trim()) clientFields.email = email.trim()
  const { error: clientError } = await supabase
    .from('clients')
    .upsert(clientFields, { onConflict: 'phone' })
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  // Resolve pet ID
  let resolvedPetId = petId || null
  if (!resolvedPetId && petName) {
    const petFields: Record<string, string> = {
      client_phone: phone,
      name: petName,
      vaccine_status: vaccineStatus || 'pending',
    }
    if (breed) petFields.breed = breed
    if (weight) petFields.weight = weight

    const { data: newPet, error: petError } = await supabase
      .from('pets')
      .insert(petFields)
      .select('id')
      .single()
    if (petError) return NextResponse.json({ error: petError.message }, { status: 500 })
    resolvedPetId = newPet.id
  }

  // New clients → status 'pending' so they appear in New Client Intake for full profile completion
  // Existing clients → auto-confirmed as before
  const now = new Date().toISOString()
  const apptFields: Record<string, string | null> = {
    client_phone: phone,
    pet_id: resolvedPetId,
    service,
    appointment_date: date,
    appointment_time: time,
    tos_agreed_at: now,
    status: isNewClient ? 'pending' : 'confirmed',
    confirmed_at: isNewClient ? null : now,
  }

  const { error } = await supabase.from('appointments').insert(apptFields)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, newClientCreated: isNewClient })
}
