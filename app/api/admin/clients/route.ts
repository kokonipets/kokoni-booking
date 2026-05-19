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

export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const phoneFilter = searchParams.get('phone')

  // 1. Fetch clients (no join — pets/pickups linked by phone, not FK)
  let clientQuery = supabase
    .from('clients')
    .select('name, phone, email, address, created_at')
    .order('created_at', { ascending: false })
  if (phoneFilter) clientQuery = clientQuery.eq('phone', phoneFilter)

  const { data: clientRows, error: clientsError } = await clientQuery
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })

  // Also pull any phones from appointments that may not have a clients row
  const { data: apptRows } = await supabase
    .from('appointments')
    .select('client_phone')
    .not('client_phone', 'is', null)

  const extraPhones = [...new Set((apptRows ?? []).map((a: { client_phone: string }) => a.client_phone))]
  const existingPhones = new Set((clientRows ?? []).map((c: { phone: string }) => c.phone))

  // Build synthetic client rows for phones only in appointments
  const syntheticClients = extraPhones
    .filter(p => !existingPhones.has(p))
    .map(p => ({ name: p, phone: p, email: null, address: null, created_at: null }))

  const clients = [...(clientRows ?? []), ...syntheticClients]
  if (clients.length === 0) return NextResponse.json({ clients: [] })

  const phones = clients.map((c: { phone: string }) => c.phone)

  // 2. Fetch pets by client_phone
  const { data: petsRaw, error: petsError } = await supabase
    .from('pets')
    .select('id, name, breed, weight, vaccine_status, vaccine_expiry, photo_url, client_phone, pet_tags ( tags ( id, name, color ) )')
    .in('client_phone', phones)
  if (petsError) return NextResponse.json({ error: petsError.message }, { status: 500 })

  // 3. Fetch authorized pickups by client_phone
  const { data: pickups, error: pickupsError } = await supabase
    .from('authorized_pickups')
    .select('id, name, relationship, client_phone')
    .in('client_phone', phones)
  if (pickupsError) return NextResponse.json({ error: pickupsError.message }, { status: 500 })

  // 4. Fetch appointments by client_phone
  let apptQuery = supabase
    .from('appointments')
    .select('id, appointment_date, appointment_time, service, status, client_phone, pet_id, assigned_groomer, assigned_bather, payment_amount, payment_method, created_at, confirmed_at, checked_in_at, grooming_started_at, grooming_finished_at, notes, notes_english, notes_chinese, notes_list, health_check, grooming_quality, health_check_completed_at, grooming_quality_completed_at')
    .order('appointment_date', { ascending: false })
  if (phoneFilter) apptQuery = apptQuery.eq('client_phone', phoneFilter)
  else apptQuery = apptQuery.in('client_phone', phones)

  const { data: appointments, error: apptError } = await apptQuery
  if (apptError) return NextResponse.json({ error: apptError.message }, { status: 500 })

  // 5. Group by phone and flatten pet_tags
  type PetWithJoin = { client_phone: string; pet_tags?: { tags: unknown }[] } & Record<string, unknown>

  const petsByPhone: Record<string, unknown[]> = {}
  for (const p of (petsRaw ?? []) as PetWithJoin[]) {
    const { pet_tags, client_phone: petPhone, ...rest } = p
    const tags = (pet_tags ?? []).map((pt: { tags: unknown }) => pt.tags).filter(Boolean)
    if (!petsByPhone[petPhone]) petsByPhone[petPhone] = []
    petsByPhone[petPhone].push({ ...rest, tags })
  }

  const pickupsByPhone: Record<string, unknown[]> = {}
  for (const pk of pickups ?? []) {
    const { client_phone, ...rest } = pk as { client_phone: string } & Record<string, unknown>
    if (!pickupsByPhone[client_phone]) pickupsByPhone[client_phone] = []
    pickupsByPhone[client_phone].push(rest)
  }

  const apptsByPhone: Record<string, unknown[]> = {}
  for (const appt of appointments ?? []) {
    if (!apptsByPhone[appt.client_phone]) apptsByPhone[appt.client_phone] = []
    apptsByPhone[appt.client_phone].push(appt)
  }

  const merged = clients.map(c => ({
    ...c,
    pets: petsByPhone[c.phone] ?? [],
    authorized_pickups: pickupsByPhone[c.phone] ?? [],
    appointments: apptsByPhone[c.phone] ?? [],
  }))

  return NextResponse.json({ clients: merged })
}

// DELETE /api/admin/clients — delete a client and their pets, pickups, appointments
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  // Delete related records first
  await supabase.from('authorized_pickups').delete().eq('client_phone', phone)
  await supabase.from('appointments').delete().eq('client_phone', phone)
  await supabase.from('pets').delete().eq('client_phone', phone)
  const { error } = await supabase.from('clients').delete().eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/admin/clients — update client info (name, email, address)
export async function PATCH(req: NextRequest) {
  const supabase = getAdminClient()
  const { phone, name, email, address } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const updates: Record<string, string | null> = {}
  if (name !== undefined) updates.name = name
  if (email !== undefined) updates.email = email || null
  if (address !== undefined) updates.address = address || null

  const { error } = await supabase
    .from('clients')
    .update(updates)
    .eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
