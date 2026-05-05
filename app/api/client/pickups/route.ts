import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// POST /api/client/pickups — add authorized pickup person
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer()
  const { phone, name, relationship } = await req.json()
  if (!phone || !name?.trim()) return NextResponse.json({ error: 'Phone and name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('authorized_pickups')
    .insert({ client_phone: phone, name: name.trim(), relationship: relationship?.trim() || null })
    .select('id, name, relationship')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pickup: data })
}

// DELETE /api/client/pickups — remove authorized pickup person
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServer()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await supabase
    .from('authorized_pickups')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
