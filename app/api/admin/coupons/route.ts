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

// GET /api/admin/coupons — list all coupons
export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupons: data ?? [] })
}

// POST /api/admin/coupons — create a new coupon
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const body = await req.json()
  const { name, code, discount_type, discount_value } = body

  if (!name || !discount_type || discount_value == null) {
    return NextResponse.json({ error: 'name, discount_type, and discount_value are required' }, { status: 400 })
  }
  if (!['percent', 'fixed'].includes(discount_type)) {
    return NextResponse.json({ error: 'discount_type must be "percent" or "fixed"' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : null,
      discount_type,
      discount_value: parseFloat(discount_value),
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupon: data }, { status: 201 })
}

// PATCH /api/admin/coupons — update a coupon (toggle active, edit fields)
export async function PATCH(req: NextRequest) {
  const supabase = getAdminClient()
  const body = await req.json()
  const { id, name, code, discount_type, discount_value, active } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  if (name !== undefined) updates.name = name.trim()
  if (code !== undefined) updates.code = code ? code.trim().toUpperCase() : null
  if (discount_type !== undefined) updates.discount_type = discount_type
  if (discount_value !== undefined) updates.discount_value = parseFloat(discount_value)
  if (active !== undefined) updates.active = active

  const { error } = await supabase.from('coupons').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/coupons — delete a coupon
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
