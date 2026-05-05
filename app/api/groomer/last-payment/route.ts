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

// GET /api/groomer/last-payment?pet_id=xxx&exclude_id=yyy
// Returns the most recent paid payment_amount for this pet (excluding current appointment)
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const petId = searchParams.get('pet_id')
  const excludeId = searchParams.get('exclude_id')

  if (!petId) return NextResponse.json({ amount: null })

  let query = supabase
    .from('appointments')
    .select('payment_amount, appointment_date, service')
    .eq('pet_id', petId)
    .eq('payment_status', 'paid')
    .not('payment_amount', 'is', null)
    .order('appointment_date', { ascending: false })
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query

  const last = data?.[0] ?? null
  return NextResponse.json({
    amount: last?.payment_amount ?? null,
    service: last?.service ?? null,
    date: last?.appointment_date ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
