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

const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

// GET /api/admin/inventory?month=YYYY-MM
// → { items (with on-hand stock), movements (that month, newest first) }
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const now = new Date()
  const month = req.nextUrl.searchParams.get('month')
    || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const end = new Date(y, m, 1).toISOString().slice(0, 10) // first day of next month

  const { data: items, error: itemsErr } = await supabase
    .from('inventory_items').select('*').order('name')
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  // Stock = sum of ALL movements. Page through (Supabase caps unbounded selects at 1000 rows).
  const stock: Record<string, number> = {}
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await supabase
      .from('inventory_movements').select('item_id, qty').order('id').range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of rows ?? []) stock[r.item_id] = (stock[r.item_id] ?? 0) + r.qty
    if (!rows || rows.length < 1000) break
  }

  const { data: movements, error: movErr } = await supabase
    .from('inventory_movements')
    .select('*')
    .gte('occurred_on', start).lt('occurred_on', end)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  return NextResponse.json({
    items: (items ?? []).map(i => ({ ...i, stock: stock[i.id] ?? 0 })),
    movements: movements ?? [],
    month,
  })
}

// POST /api/admin/inventory
// { action: 'add_item' | 'update_item' | 'delete_item' | 'move' | 'delete_movement', ... }
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const b = await req.json()

  if (b.action === 'add_item' || b.action === 'update_item') {
    const name = String(b.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const row = {
      name,
      unit_cost: num(b.unit_cost),
      sale_price: num(b.sale_price),
      low_stock_threshold: Math.max(0, Math.round(num(b.low_stock_threshold) ?? 0)),
      vendor: String(b.vendor ?? '').trim() || null,
    }
    const q = b.action === 'add_item'
      ? supabase.from('inventory_items').insert(row)
      : supabase.from('inventory_items').update(row).eq('id', b.id)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (b.action === 'delete_item') {
    const { error } = await supabase.from('inventory_items').delete().eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (b.action === 'move') {
    const type = b.type as 'in' | 'out' | 'adjust'
    const qtyAbs = Math.round(num(b.qty) ?? 0)
    if (!b.item_id || !['in', 'out', 'adjust'].includes(type) || qtyAbs === 0) {
      return NextResponse.json({ error: 'item, type and a non-zero qty are required' }, { status: 400 })
    }
    // in = +, out = -, adjust keeps the sign the user typed.
    const qty = type === 'in' ? Math.abs(qtyAbs) : type === 'out' ? -Math.abs(qtyAbs) : qtyAbs
    const { error } = await supabase.from('inventory_movements').insert({
      item_id: b.item_id,
      type,
      qty,
      unit_price: num(b.unit_price),
      payment_method: type === 'out' ? (b.payment_method || null) : null,
      supplier: type === 'in' ? (String(b.supplier ?? '').trim() || null) : null,
      note: String(b.note ?? '').trim() || null,
      occurred_on: b.occurred_on || undefined,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (b.action === 'delete_movement') {
    const { error } = await supabase.from('inventory_movements').delete().eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
