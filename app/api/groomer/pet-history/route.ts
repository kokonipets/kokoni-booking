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

// GET /api/groomer/pet-history?pet_id=xxx&exclude_id=yyy&limit=6
// Returns this pet's most recent PAID appointments (any groomer), most recent first —
// so a groomer can see what service/price a pet had last time, not just the amount.
// Shape matches /api/groomer/appointments so a returned visit can be passed straight
// into the same appointment detail popup (click a past visit to reopen it).
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const petId = searchParams.get('pet_id')
  const excludeId = searchParams.get('exclude_id')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '6', 10) || 6, 20)

  if (!petId) return NextResponse.json({ visits: [] })

  let query = supabase
    .from('appointments')
    .select(`
      id,
      client_phone,
      service,
      appointment_date,
      appointment_time,
      status,
      grooming_status,
      groomer_confirmed,
      created_at,
      confirmed_at,
      assigned_groomer,
      assigned_bather,
      notes,
      notes_list,
      payment_amount,
      payment_method,
      payment_status,
      tip_amount,
      discount_amount,
      discount_label,
      discount_percent,
      size_tier,
      grooming_quality,
      checked_in_at,
      grooming_started_at,
      grooming_finished_at,
      checked_out_at,
      clients (
        name,
        phone,
        email
      ),
      pets (
        id,
        name,
        breed,
        weight,
        photo_url
      )
    `)
    .eq('pet_id', petId)
    .eq('payment_status', 'paid')
    .not('payment_amount', 'is', null)
    .order('appointment_date', { ascending: false })
    .limit(limit)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) return NextResponse.json({ visits: [] }, { status: 200 })

  return NextResponse.json({ visits: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
