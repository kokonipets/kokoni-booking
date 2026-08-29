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

// Supabase/PostgREST caps any unbounded select() at 1000 rows by default. Once a
// table crosses that, a single query silently returns only the first 1000 rows —
// no error, no warning — which showed up as clients randomly missing pets/
// appointments that actually exist. Page through with .range() so every row is
// always returned regardless of table size.
const PAGE_SIZE = 1000
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) return { data: all, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const phoneFilter = searchParams.get('phone')

  // 1. Fetch clients (no join — pets/pickups linked by phone, not FK).
  //    Client rows are matched EXACTLY: the admin lookup tries every phone format
  //    in turn, so exact matching is enough and — unlike normalized matching —
  //    won't surface a duplicate/orphan client row that happens to share a number.
  type ClientRow = { name: string; phone: string; email: string | null; address: string | null; created_at: string | null; sms_consent: boolean; sms_consent_at: string | null }
  const { data: clientRows, error: clientsError } = await fetchAllRows<ClientRow>((from, to) => {
    let q = supabase
      .from('clients')
      .select('name, phone, email, address, created_at, sms_consent, sms_consent_at')
      .order('created_at', { ascending: false })
      .order('phone', { ascending: true })
      .range(from, to)
    if (phoneFilter) q = q.eq('phone', phoneFilter)
    return q
  })
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })

  // Also pull any phones from appointments that may not have a clients row.
  // IMPORTANT: respect the phone filter here too — previously this query was
  // unfiltered, so every single-client lookup returned ALL clients (the synthetic
  // rows leaked in), which broke the admin "find client by phone" flow.
  const { data: apptRows } = await fetchAllRows<{ client_phone: string }>((from, to) => {
    let q = supabase
      .from('appointments')
      .select('client_phone')
      .not('client_phone', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)
    if (phoneFilter) q = q.eq('client_phone', phoneFilter)
    return q
  })

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
  const { data: petsRaw, error: petsError } = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let q = supabase
      .from('pets')
      .select('id, name, breed, weight, vaccine_status, vaccine_expiry, photo_url, client_phone, pet_tags ( tags ( id, name, color ) )')
      .order('id', { ascending: true })
      .range(from, to)
    if (phoneFilter) q = q.in('client_phone', childPhones)
    return q
  })
  if (petsError) return NextResponse.json({ error: petsError.message }, { status: 500 })

  // 3. Fetch authorized pickups
  const { data: pickups, error: pickupsError } = await fetchAllRows<{ id: string; name: string; relationship: string | null; client_phone: string }>((from, to) => {
    let q = supabase
      .from('authorized_pickups')
      .select('id, name, relationship, client_phone')
      .order('id', { ascending: true })
      .range(from, to)
    if (phoneFilter) q = q.in('client_phone', childPhones)
    return q
  })
  if (pickupsError) return NextResponse.json({ error: pickupsError.message }, { status: 500 })

  // 4. Fetch appointments
  const { data: appointments, error: apptError } = await fetchAllRows<{ client_phone: string } & Record<string, unknown>>((from, to) => {
    let q = supabase
      .from('appointments')
      .select('id, appointment_date, appointment_time, service, status, client_phone, pet_id, assigned_groomer, assigned_bather, payment_amount, payment_method, tip_amount, created_at, confirmed_at, checked_in_at, grooming_started_at, grooming_finished_at, notes, notes_english, notes_chinese, notes_list, health_check, grooming_quality, health_check_completed_at, grooming_quality_completed_at')
      .order('appointment_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
    if (phoneFilter) q = q.in('client_phone', childPhones)
    return q
  })
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
  // Match every stored format of the number (see phoneVariants() above) — pets/
  // appointments/pickups aren't always saved in the same format as clients.phone,
  // so an exact-only match here leaves orphaned rows behind under a differently
  // formatted phone, which then resurface as a "ghost" duplicate client later.
  const phoneVariantsForDelete = phoneVariants(normalizePhone(phone))
  const [{ data: clientRow }, { data: petsRows }, { data: apptRows }, { data: pickupRows }] = await Promise.all([
    supabase.from('clients').select('*').eq('phone', phone).maybeSingle(),
    supabase.from('pets').select('*').in('client_phone', phoneVariantsForDelete),
    supabase.from('appointments').select('*').in('client_phone', phoneVariantsForDelete),
    supabase.from('authorized_pickups').select('*').in('client_phone', phoneVariantsForDelete),
  ])
  await supabase.from('deleted_clients_log').insert({
    phone,
    client: clientRow ?? { phone },
    pets: petsRows ?? [],
    appointments: apptRows ?? [],
    authorized_pickups: pickupRows ?? [],
  })

  // Delete related records first
  await supabase.from('authorized_pickups').delete().in('client_phone', phoneVariantsForDelete)
  await supabase.from('appointments').delete().in('client_phone', phoneVariantsForDelete)
  await supabase.from('pets').delete().in('client_phone', phoneVariantsForDelete)
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

  // If phone number is changing, migrate all linked tables then upsert new record.
  // pets/appointments/authorized_pickups are frequently saved in a DIFFERENT phone
  // format than clients.phone (see phoneVariants() above) — matching only the exact
  // `phone` string here silently migrated 0 child rows whenever formats didn't line
  // up, which deleted the old client row while leaving pets/appointments orphaned
  // under the old number. GET then synthesizes those orphans back into a duplicate
  // "client" — this is the bug where editing a phone number appeared to create a
  // second profile. Match every stored format of the old number instead.
  if (newPhone && newPhone !== phone) {
    const oldVariants = phoneVariants(normalizePhone(phone))
    const [petsRes, apptRes, pickupRes] = await Promise.all([
      supabase.from('pets').update({ client_phone: newPhone }).in('client_phone', oldVariants),
      supabase.from('appointments').update({ client_phone: newPhone }).in('client_phone', oldVariants),
      supabase.from('authorized_pickups').update({ client_phone: newPhone }).in('client_phone', oldVariants),
    ])
    const migrateErr = petsRes.error || apptRes.error || pickupRes.error
    if (migrateErr) return NextResponse.json({ error: migrateErr.message }, { status: 500 })
    // Upsert new phone record, then delete old one(s) across all stored formats
    const { error: upsertErr } = await supabase.from('clients').upsert({ phone: newPhone, ...updates }, { onConflict: 'phone' })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    await supabase.from('clients').delete().in('phone', oldVariants)
    return NextResponse.json({ success: true })
  }

  // Upsert so synthetic clients (phone-only, no DB row) get a real row created
  const { error } = await supabase
    .from('clients')
    .upsert({ phone, ...updates }, { onConflict: 'phone' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
