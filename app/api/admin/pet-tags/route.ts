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

// GET /api/admin/pet-tags?pet_id=... — list tags assigned to a pet
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const petId = searchParams.get('pet_id')
  if (!petId) return NextResponse.json({ error: 'pet_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('pet_tags')
    .select('tag_id, tags (id, name, color)')
    .eq('pet_id', petId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const tags = (data ?? []).map((r: { tags: unknown }) => r.tags).filter(Boolean)
  return NextResponse.json({ tags })
}

// POST — assign a tag to a pet  { pet_id, tag_id }
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { pet_id, tag_id } = await req.json()
  if (!pet_id || !tag_id) return NextResponse.json({ error: 'pet_id and tag_id required' }, { status: 400 })

  const { error } = await supabase
    .from('pet_tags')
    .upsert({ pet_id, tag_id }, { onConflict: 'pet_id,tag_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — remove a tag from a pet  { pet_id, tag_id }
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const { pet_id, tag_id } = await req.json()
  if (!pet_id || !tag_id) return NextResponse.json({ error: 'pet_id and tag_id required' }, { status: 400 })

  const { error } = await supabase
    .from('pet_tags')
    .delete()
    .eq('pet_id', pet_id)
    .eq('tag_id', tag_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
