import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// PATCH: update pet (photo_url, breed, name, vaccine_status, notes_chinese, notes_english)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getAdminClient()
  const body = await req.json()
  const { action, ...updateData } = body

  // Handle update-notes action for bilingual notes
  if (action === 'update-notes') {
    const { error } = await supabase
      .from('pets')
      .update({
        notes_chinese: updateData.notes_chinese,
        notes_english: updateData.notes_english,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Default update for other fields
  const { error } = await supabase
    .from('pets')
    .update(updateData)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getAdminClient()
  const id = params.id

  // Delete related records first to avoid foreign key constraint errors
  await supabase.from('vaccination_records').delete().eq('pet_id', id)
  await supabase.from('appointments').delete().eq('pet_id', id)

  const { error } = await supabase.from('pets').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
