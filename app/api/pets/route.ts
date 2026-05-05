import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// POST /api/pets — add a new pet for an existing client
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer()
  const {
    phone,
    name,
    breed,
    weight,
    vaccineFileUrl,
    vaccineEmailOnly,
    vaccineSmsOnly,
  } = await req.json()

  if (!phone || !name) {
    return NextResponse.json({ error: 'Phone and name required' }, { status: 400 })
  }

  // Verify client exists
  const { data: client } = await supabase
    .from('clients')
    .select('phone')
    .eq('phone', phone)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const vaccineStatus = vaccineFileUrl
    ? 'pending'
    : (vaccineEmailOnly || vaccineSmsOnly)
      ? 'email_sent'
      : 'pending'

  const { data: pet, error } = await supabase
    .from('pets')
    .insert({
      client_phone: phone,
      name: name.trim(),
      breed: breed?.trim() || null,
      weight: weight || null,
      vaccine_status: vaccineStatus,
      is_active: true,
    })
    .select('id, name, breed, weight, vaccine_status, photo_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create a vaccination record if any vaccine option was provided
  if (pet && (vaccineFileUrl || vaccineEmailOnly || vaccineSmsOnly)) {
    await supabase.from('vaccination_records').insert({
      pet_id: pet.id,
      file_url: vaccineFileUrl || null,
      is_email_only: !!(vaccineEmailOnly || vaccineSmsOnly),
    })
  }

  return NextResponse.json({ pet })
}

// PATCH /api/pets — update pet information
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServer()
  const {
    petId,
    name,
    breed,
    weight,
    birthday,
  } = await req.json()

  if (!petId || !name) {
    return NextResponse.json({ error: 'Pet ID and name required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pets')
    .update({
      name: name.trim(),
      breed: breed?.trim() || null,
      weight: weight?.trim() || null,
      birthday: birthday || null,
    })
    .eq('id', petId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
