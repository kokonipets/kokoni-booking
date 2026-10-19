import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finalizeRetailSale } from '@/lib/retail-sale'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const SQUARE_API = 'https://connect.squareup.com/v2'
const sqHeaders = () => ({
  'Square-Version': '2024-01-17',
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
})
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST /api/admin/retail-sale
//   { action:'create', lines:[{item_id, qty}], method:'cash'|'card'|'zelle'|'venmo', note? }
//   { action:'cancel', id }
// Prices come from the item's sale_price on the server (tax-inclusive) — never trusted from the client.
export async function POST(req: NextRequest) {
  const supabase = admin()
  const b = await req.json()

  if (b.action === 'cancel') {
    const { data: sale } = await supabase.from('retail_sales').select('id, status, checkout_id').eq('id', b.id).maybeSingle()
    if (!sale || sale.status !== 'pending') return NextResponse.json({ success: true })
    if (sale.checkout_id) {
      // If Square already completed it, finalize instead of cancelling (money was taken).
      const r = await fetch(`${SQUARE_API}/terminals/checkouts/${sale.checkout_id}`, { headers: sqHeaders() })
      const d = await r.json()
      if (d.checkout?.status === 'COMPLETED') {
        await finalizeRetailSale(supabase, sale.id)
        return NextResponse.json({ success: true, status: 'paid' })
      }
      await fetch(`${SQUARE_API}/terminals/checkouts/${sale.checkout_id}/cancel`, { method: 'POST', headers: sqHeaders() }).catch(() => {})
    }
    await supabase.from('retail_sales').update({ status: 'cancelled' }).eq('id', sale.id).eq('status', 'pending')
    return NextResponse.json({ success: true, status: 'cancelled' })
  }

  if (b.action !== 'create') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const method = String(b.method)
  if (!['cash', 'card', 'zelle', 'venmo'].includes(method)) return NextResponse.json({ error: 'Bad payment method' }, { status: 400 })
  const reqLines = (b.lines ?? []) as { item_id: string; qty: number }[]
  if (reqLines.length === 0) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })

  const { data: items, error: itemErr } = await supabase
    .from('inventory_items').select('id, name, sale_price').in('id', reqLines.map(l => l.item_id))
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

  const lines: { item_id: string; name: string; qty: number; unit_price: number }[] = []
  for (const l of reqLines) {
    const it = items?.find(i => i.id === l.item_id)
    const qty = Math.round(Number(l.qty))
    const price = parseFloat(it?.sale_price ?? '')
    if (!it || !(qty > 0)) return NextResponse.json({ error: 'Bad item or quantity' }, { status: 400 })
    if (isNaN(price)) return NextResponse.json({ error: `${it.name} has no sale price` }, { status: 400 })
    lines.push({ item_id: it.id, name: it.name, qty, unit_price: price })
  }
  const total = Math.round(lines.reduce((t, l) => t + l.qty * l.unit_price, 0) * 100) / 100

  const { data: sale, error } = await supabase
    .from('retail_sales')
    .insert({ lines, total, payment_method: method, status: 'pending', note: b.note || null })
    .select('id').single()
  if (error || !sale) return NextResponse.json({ error: error?.message ?? 'Could not create sale' }, { status: 500 })

  if (method !== 'card') {
    await finalizeRetailSale(supabase, sale.id)
    return NextResponse.json({ success: true, id: sale.id, status: 'paid', total })
  }

  const deviceId = process.env.SQUARE_TERMINAL_DEVICE_ID
  if (!deviceId || !process.env.SQUARE_ACCESS_TOKEN) {
    await supabase.from('retail_sales').update({ status: 'cancelled' }).eq('id', sale.id)
    return NextResponse.json({ error: 'Card terminal not configured' }, { status: 500 })
  }
  const res = await fetch(`${SQUARE_API}/terminals/checkouts`, {
    method: 'POST',
    headers: sqHeaders(),
    body: JSON.stringify({
      idempotency_key: `retail-${sale.id}`,
      checkout: {
        amount_money: { amount: Math.round(total * 100), currency: 'USD' },
        reference_id: `retail:${sale.id}`,
        note: `Retail - ${lines.map(l => `${l.name} x${l.qty}`).join(', ').slice(0, 120)}`,
        device_options: { device_id: deviceId },
        payment_options: { autocomplete: true },
      },
    }),
  })
  const data = await res.json()
  if (!res.ok || data.errors) {
    await supabase.from('retail_sales').update({ status: 'cancelled' }).eq('id', sale.id)
    return NextResponse.json({ error: data.errors?.[0]?.detail || 'Square error' }, { status: 500 })
  }
  await supabase.from('retail_sales').update({ checkout_id: data.checkout.id }).eq('id', sale.id)
  return NextResponse.json({ success: true, id: sale.id, status: 'pending', total })
}

// GET /api/admin/retail-sale?id=... — poll a card sale; finalizes it when Square says COMPLETED.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = admin()
  const { data: sale } = await supabase.from('retail_sales').select('id, status, checkout_id, total').eq('id', id).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sale.status === 'pending' && sale.checkout_id) {
    const r = await fetch(`${SQUARE_API}/terminals/checkouts/${sale.checkout_id}`, { headers: sqHeaders() })
    const d = await r.json()
    const st = d.checkout?.status
    if (st === 'COMPLETED') { await finalizeRetailSale(supabase, sale.id); return NextResponse.json({ status: 'paid' }) }
    if (st === 'CANCELED' || st === 'CANCELLED' || st === 'CANCEL_REQUESTED') {
      await supabase.from('retail_sales').update({ status: 'cancelled' }).eq('id', sale.id).eq('status', 'pending')
      return NextResponse.json({ status: 'cancelled' })
    }
  }
  return NextResponse.json({ status: sale.status })
}
