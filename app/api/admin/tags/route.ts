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

const ALLOWED_COLORS = ['sky', 'rose', 'amber', 'violet', 'emerald', 'teal', 'pink', 'gray', 'indigo', 'orange']

// GET — list all active tags
export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color, is_active, created_at')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tags: data ?? [] })
}

// POST — create a new tag
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { name, color } = await req.json()
  if (!name || !name.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const safeColor = ALLOWED_COLORS.includes(color) ? color : 'sky'

  const { data, error } = await supabase
    .from('tags')
    .insert({ name: name.trim(), color: safeColor, is_active: true })
    .select('id, name, color, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tag: data })
}

// PATCH — edit tag name/color
export async function PATCH(req: NextRequest) {
  const supabase = getAdminClient()
  const { id, name, color } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: Record<string, string> = {}
  if (name !== undefined) updates.name = String(name).trim()
  if (color !== undefined && ALLOWED_COLORS.includes(color)) updates.color = color
  const { error } = await supabase.from('tags').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — soft-delete (set is_active = false). Keeps history on pets intact.
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // hard-delete to also remove junction rows via cascade
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
