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

// Normalize a phone to its bare digits so the same number matches regardless of
// the format it was stored in — "(626) 429-0038", "626-429-0038", "+16264290038"
// and "6264290038" all normalize to "6264290038".
function normalizePhone(p?: string | null): string {
  return (p || '').replace(/\D/g, '')
}

// All common stored formats for a 10-digit number, used to fetch child rows
// (pets / pickups / appointments) that may have been saved in a different format
// than the client record.
function phoneVariants(digits: string): string[] {
  const v = [digits]
  if (digits.length === 10) {
    v.push(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`)
    v.push(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`)
    v.push(`+1${digits}`)
  }
  return v
}

export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const phoneFilter = searchParams.get('phone')

  // 1. Fetch clients (no join — pets/pickups linked by phone, not FK).
  //    Client rows are matched EXACTLY: the admin lookup tries every phone format
  //    in turn, so exact matching is enough and — unlike normalized matching —
  //    won't surface a duplicate/orphan client row that happens to share a number.
  let clientQuery = supabase
    .from('clients')
    .select('name, phone, email, address, created_at, sms_consent, sms_consent_at')
    .order('created_at', { ascending: false })
  if (phoneFilter) clientQuery = clientQuery.eq('phone', phoneFilter)

  const { data: clientRows, error: clientsError } = await clientQuery
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })

  // Also pull any phones from appointments that may not have a clients row.
  // IMPORTANT: respect the phone filter here too — previously this query was
  // unfiltered, so every single-client lookup returned ALL clients (the synthetic
  // rows leaked in), which broke the admin "find client by phone" flow.
  let apptPhoneQuery = supabase
    .from('appointments')
    .select('client_phone')
    .not('client_phone', 'is', null)
  if (phoneFilter) apptPhoneQuery = apptPhoneQuery.eq('client_phone', phoneFilter)
  const { data: apptRows } = await apptPhoneQuery

  const extraPhones = [...new Set((apptRows ?? []).map((a: { client_phone: string }) => a.client_phone))]
  const existingPhones = new Set((clientRows ?? []).map((c: { phone: string }) => c.phone))

  // Build synthetic client rows for phones only in appointments
  const syntheticClients = extraPhones
    .filter(p => !existingPhones.has(p))
    .map(p => ({ name: p, phone: p, email: null, address: null, created_at: null, sms_consent: false, sms_consent_at: null }))

  const clients = [...(clientRows ?? []), ...syntheticClients]
  if (clients.length === 0) return NextResponse.json({ clients: [] })

  // Child rows (pets/pickups/appointments) are linked by NORMALIZED phone below,
  // so fetch them across all format variants of the matched clients' numbers. This
  // makes a client whose number was saved in one format still show pets/appointments
  // that were saved in another format.
  const targetNorms = [...new Set(clients.map(c => normalizePhone(c.phone)).filter(Boolean))]
  const childPhones = [...new Set(targetNorms.flatMap(phoneVariants))]

  // 2. Fetch pets
  let petsQuery = supabase
    .from('pets')
    .select('id, name, breed, weight, vaccine_status, vaccine_expiry, photo_url, client_phone, pet_tags ( tags ( id, name, color ) )')
  if (phoneFilter) petsQuery = petsQuery.in('client_phone', childPhones)
  const { data: petsRaw, error: petsError } = await petsQuery
  if (petsError) return NextResponse.json({ error: petsError.message }, { status: 500 })

  // 3. Fetch authorized pickups
  let pickupsQuery = supabase
    .from('authorized_pickups')
    .select('id, name, relationship, client_phone')
  if (phoneFilter) pickupsQuery = pickupsQuery.in('client_phone', childPhones)
  const { data: pickups, error: pickupsError } = await pickupsQuery
  if (pickupsError) return NextResponse.json({ error: pickupsError.message }, { status: 500 })

  // 4. Fetch appointments
  let apptQuery = supabase
    .from('appointments')
    .select('id, appointment_date, appointment_time, service, status, client_phone, pet_id, assigned_groomer, assigned_bather, payment_amount, payment_method, created_at, confirmed_at, checked_in_at, grooming_started_at, grooming_finished_at, notes, notes_english, notes_chinese, notes_list, health_check, grooming_quality, health_check_completed_at, grooming_quality_completed_at')
    .order('appointment_date', { ascending: false })
  if (phoneFilter) apptQuery = apptQuery.in('client_phone', childPhones)

  const { data: appointments, error: apptError } = await apptQuery
  if (apptError) return NextResponse.json({ error: apptError.message }, { status: 500 })

  // 5. Group child rows by NORMALIZED phone so format mismatches still link, then
  //    flatten pet_tags.
  type PetWithJoin = { client_phone: string; pet_tags?: { tags: unknown }[] } & Record<string, unknown>

  const petsByNorm: Record<string, unknown[]> = {}
  for (const p of (petsRaw ?? []) as PetWithJoin[]) {
    const { pet_tags, client_phone: petPhone, ...rest } = p
    const tags = (pet_tags ?? []).map((pt: { tags: unknown }) => pt.tags).filter(Boolean)
    const n = normalizePhone(petPhone)
    if (!petsByNorm[n]) petsByNorm[n] = []
    petsByNorm[n].push({ ...rest, tags })
  }

  const pickupsByNorm: Record<string, unknown[]> = {}
  for (const pk of pickups ?? []) {
    const { client_phone, ...rest } = pk as { client_phone: string } & Record<string, unknown>
    const n = normalizePhone(client_phone)
    if (!pickupsByNorm[n]) pickupsByNorm[n] = []
    pickupsByNorm[n].push(rest)
  }

  const apptsByNorm: Record<string, unknown[]> = {}
  for (const appt of (appointments ?? []) as { client_phone: string }[]) {
    const n = normalizePhone(appt.client_phone)
    if (!apptsByNorm[n]) apptsByNorm[n] = []
    apptsByNorm[n].push(appt)
  }

  const merged = clients.map(c => {
    const n = normalizePhone(c.phone)
    return {
      ...c,
      pets: petsByNorm[n] ?? [],
      authorized_pickups: pickupsByNorm[n] ?? [],
      appointments: apptsByNorm[n] ?? [],
    }
  })

  return NextResponse.json({ clients: merged })
}

// DELETE /api/admin/clients — delete a client and their pets, pickups, appointments
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  // Snapshot everything before it's gone. The delete below is still permanent —
  // this just keeps a record of what existed, so staff can look up a client's
  // history later even after removing them from the live app.
  const [{ data: clientRow }, { data: petsRows }, { data: apptRows }, { data: pickupRows }] = await Promise.all([
    supabase.from('clients').select('*').eq('phone', phone).maybeSingle(),
    supabase.from('pets').select('*').eq('client_phone', phone),
    supabase.from('appointments').select('*').eq('client_phone', phone),
    supabase.from('authorized_pickups').select('*').eq('client_phone', phone),
  ])
  await supabase.from('deleted_clients_log').insert({
    phone,
    client: clientRow ?? { phone },
    pets: petsRows ?? [],
    appointments: apptRows ?? [],
    authorized_pickups: pickupRows ?? [],
  })

  // Delete related records first
  await supabase.from('authorized_pickups').delete().eq('client_phone', phone)
  await supabase.from('appointments').delete().eq('client_phone', phone)
  await supabase.from('pets').delete().eq('client_phone', phone)
  const { error } = await supabase.from('clients').delete().eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/admin/clients — update client info (name, email, address, phone)
export async function PATCH(req: NextRequest) {
  const supabase = getAdminClient()
  const { phone, newPhone, name, email, address, sms_consent } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const updates: Record<string, string | null | boolean> = {}
  if (name !== undefined) updates.name = name
  if (email !== undefined) updates.email = email || null
  if (address !== undefined) updates.address = address || null
  // Staff can record SMS opt-in on the client's behalf (e.g. customer verbally
  // agreed at checkout but didn't check the box during booking). Never used to
  // turn consent OFF from this endpoint — only to capture a true opt-in.
  if (sms_consent === true) {
    updates.sms_consent = true
    updates.sms_consent_at = new Date().toISOString()
  }

  // `name` is NOT NULL on the clients table. Postgres validates NOT NULL on the
  // candidate row BEFORE it ever evaluates the upsert's ON CONFLICT clause, so an
  // upsert that omits `name` fails outright — even when the row already exists and
  // only e.g. sms_consent is changing (this is what broke "Mark opted-in": it sends
  // only {phone, sms_consent}, no name). Carry the existing name forward so the
  // candidate row always satisfies the constraint.
  if (updates.name === undefined) {
    const { data: existing } = await supabase.from('clients').select('name').eq('phone', phone).maybeSingle()
    updates.name = existing?.name ?? phone
  }

  // If phone number is changing, migrate all linked tables then upsert new record
  if (newPhone && newPhone !== phone) {
    await supabase.from('pets').update({ client_phone: newPhone }).eq('client_phone', phone)
    await supabase.from('appointments').update({ client_phone: newPhone }).eq('client_phone', phone)
    await supabase.from('authorized_pickups').update({ client_phone: newPhone }).eq('client_phone', phone)
    // Upsert new phone record, then delete old one
    const { error: upsertErr } = await supabase.from('clients').upsert({ phone: newPhone, ...updates }, { onConflict: 'phone' })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    await supabase.from('clients').delete().eq('phone', phone)
    return NextResponse.json({ success: true })
  }

  // Upsert so synthetic clients (phone-only, no DB row) get a real row created
  const { error } = await supabase
    .from('clients')
    .upsert({ phone, ...updates }, { onConflict: 'phone' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
