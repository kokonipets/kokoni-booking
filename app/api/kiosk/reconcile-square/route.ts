import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finalizeRetailSale } from '@/lib/retail-sale'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const SQUARE_API = 'https://connect.squareup.com/v2'

// POST /api/kiosk/reconcile-square
//
// Safety net for the kiosk card flow. The kiosk page records a Terminal payment only while
// its own browser tab keeps polling Square; if that tab resets / sleeps / reloads right after
// the customer pays, Square has the money but the appointment stays "unpaid". This asks
// Square directly for recent COMPLETED Terminal checkouts (we set reference_id = appointment
// id) and finishes any appointment that is still unpaid. Idempotent — safe to call often.
export async function POST() {
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const startAt = new Date(Date.now() - 36 * 3600_000).toISOString()
  const res = await fetch(`${SQUARE_API}/terminals/checkouts/search`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-01-17',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { filter: { status: 'COMPLETED', created_at: { start_at: startAt } } },
      limit: 100,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.errors) {
    return NextResponse.json({ error: data.errors?.[0]?.detail || 'Square error' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const fixed: string[] = []
  for (const c of (data.checkouts ?? []) as {
    reference_id?: string
    amount_money?: { amount?: number }
    tip_money?: { amount?: number }
    updated_at?: string
  }[]) {
    const id = c.reference_id
    if (!id) continue
    // Counter retail sales (admin "Sell" tab) use reference_id = retail:<saleId>.
    if (id.startsWith('retail:')) {
      if (await finalizeRetailSale(supabase, id.slice(7))) fixed.push(id)
      continue
    }
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, payment_status, payment_amount')
      .eq('id', id)
      .maybeSingle()
    if (!appt || appt.payment_status === 'paid') continue

    const collected = (c.amount_money?.amount ?? 0) / 100
    const base = parseFloat(appt.payment_amount ?? '') || 0
    // Tip = whatever was charged above the service price (kiosk adds the tip to the total).
    const tip = c.tip_money?.amount != null ? c.tip_money.amount / 100 : Math.max(0, collected - base)
    const now = c.updated_at ?? new Date().toISOString()
    const update: Record<string, string> = {
      status: 'completed',
      grooming_status: 'done',
      grooming_status_updated_at: now,
      checked_out_at: now,
      payment_method: 'card',
      payment_status: 'paid',
    }
    if (tip > 0) update.tip_amount = String(Math.round(tip * 100) / 100)

    const { error } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id)
      .neq('payment_status', 'paid')
    if (!error) {
      fixed.push(id)
      await supabase
        .from('dog_checkins')
        .update({ status: 'checked_out', updated_at: new Date().toISOString(), updated_by: 'square-reconcile' })
        .eq('appointment_id', id)
    }
  }

  return NextResponse.json({ success: true, reconciled: fixed.length })
}
