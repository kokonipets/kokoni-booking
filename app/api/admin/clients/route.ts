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

  // Fetch clients with their pets and authorized pickups
  let query = supabase
    .from('clients')
    .select(`
      name, phone, email, address, created_at,
      pets (id, name, breed, weight, vaccine_status, vaccine_expiry, photo_url, pet_tags ( tags ( id, name, color ) )),
      authorized_pickups (id, name, relationship)
    `)
    .order('created_at', { ascending: false })

  if (phoneFilter) query = query.eq('phone', phoneFilter)

  const { data: clients, error: clientsError } = await query

  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })

  // Fetch appointments separately (they link via client_phone, not client_id)
  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('id, appointment_date, appointment_time, service, status, client_phone, pet_id, assigned_groomer, assigned_bather, payment_amount, payment_method, created_at, confirmed_at, checked_in_at, grooming_started_at, grooming_finished_at, notes, notes_english, notes_chinese, notes_list, health_check, grooming_quality, health_check_completed_at, grooming_quality_completed_at')
    .order('appointment_date', { ascending: false })

  if (apptError) return NextResponse.json({ error: apptError.message }, { status: 500 })

  // Stitch appointments onto each client by phone
  const apptsByPhone: Record<string, typeof appointments> = {}
  for (const appt of appointments ?? []) {
    if (!apptsByPhone[appt.client_phone]) apptsByPhone[appt.client_phone] = []
    apptsByPhone[appt.client_phone]!.push(appt)
  }

  // Flatten each pet's pet_tags -> tags array
  type PetWithJoin = { pet_tags?: { tags: unknown }[] } & Record<string, unknown>
  const flattenPets = (pets: PetWithJoin[] | null | undefined) =>
    (pets ?? []).map(p => {
      const { pet_tags, ...rest } = p
      const tags = (pet_tags ?? []).map(pt => pt.tags).filter(Boolean)
      return { ...rest, tags }
    })

  const merged = (clients ?? []).map(c => ({
    ...c,
    pets: flattenPets((c as unknown as { pets: PetWithJoin[] }).pets),
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
  await supabase.from('pets').delete().eq('owner_phone', phone)
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
