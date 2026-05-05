import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// GET /api/client?phone=6264290038
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const supabase = createSupabaseServer()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .single()

  if (!client) return NextResponse.json({ found: false })

  const { data: petsRaw } = await supabase
    .from('pets')
    .select('id, name, breed, vaccine_status, photo_url, pet_tags ( tags ( id, name, color ) )')
    .eq('client_phone', phone)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  type PetRow = { pet_tags?: { tags: unknown }[] } & Record<string, unknown>
  const pets = ((petsRaw as PetRow[] | null) ?? []).map(p => {
    const { pet_tags, ...rest } = p
    return { ...rest, tags: (pet_tags ?? []).map(pt => pt.tags).filter(Boolean) }
  })

  // Also fetch appointment history
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, appointment_date, appointment_time, service, status, pets(name)')
    .eq('client_phone', phone)
    .order('appointment_date', { ascending: false })
    .limit(20)

  // Fetch authorized pickups
  const { data: pickups } = await supabase
    .from('authorized_pickups')
    .select('id, name, relationship')
    .eq('client_phone', phone)
    .order('created_at', { ascending: true })

  return NextResponse.json({ found: true, client, pets, appointments: appointments ?? [], pickups: pickups ?? [] })
}

// PATCH /api/client — update name, email, and/or address
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServer()
  const { phone, name, email, address } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  const updates: Record<string, string | null> = {}
  if (name !== undefined) updates.name = name
  if (email !== undefined) updates.email = email
  if (address !== undefined) updates.address = address

  const { error } = await supabase
    .from('clients')
    .update(updates)
    .eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
