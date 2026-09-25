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
    .select('payment_amount, discount_amount, notes_list, appointment_date, service')
    .eq('pet_id', petId)
    .eq('payment_status', 'paid')
    .not('payment_amount', 'is', null)
    .order('appointment_date', { ascending: false })
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query

  const last = data?.[0] ?? null

  // payment_amount is the actual amount CHARGED last time — after add-ons were
  // priced in and any discount was taken off. Suggesting that number as-is for
  // a brand-new appointment would silently carry over a one-time discount (and
  // any one-off add-on) as if it were the pet's normal base price, so a later
  // visit's "regular" price quietly becomes last time's discounted total. Undo
  // both the same way the price popup reconstructs it: add the saved discount
  // back, then subtract add-on prices pulled from notes_list.
  let amount: string | null = last?.payment_amount ?? null
  if (last && amount) {
    const notesList = (last as { notes_list?: { price?: string; is_addon?: boolean }[] | null }).notes_list ?? []
    const addonTotal = (notesList ?? [])
      .filter(n => n?.is_addon)
      .reduce((s, n) => s + (parseFloat(n?.price || '0') || 0), 0)
    const savedDiscount = parseFloat((last as { discount_amount?: string | null }).discount_amount || '') || 0
    const base = parseFloat(amount) + savedDiscount - addonTotal
    if (base > 0) amount = base.toFixed(2)
  }

  return NextResponse.json({
    amount,
    service: last?.service ?? null,
    date: last?.appointment_date ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
