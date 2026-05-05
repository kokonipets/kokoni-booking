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

// GET /api/admin/vaccines — vaccination records with pet + client info
// ?all=true returns all records (verified + unverified); default = pending only
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const showAll = req.nextUrl.searchParams.get('all') === 'true'

  let query = supabase
    .from('vaccination_records')
    .select(`
      id, file_url, is_email_only, verified, verified_at, submitted_at, admin_notes,
      pets!pet_id (id, name, breed, photo_url, vaccine_status, vaccine_expiry, client_phone,
        clients (name, phone, email)
      )
    `)
    .order('submitted_at', { ascending: false })

  if (!showAll) query = query.eq('verified', false)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate signed URLs for uploaded files so admin can view them securely
  const records = await Promise.all((data ?? []).map(async (rec) => {
    let signedUrl: string | null = null
    if (rec.file_url) {
      // Extract just the filename from the full URL
      const fileName = rec.file_url.split('/vaccination-docs/').pop()
      if (fileName) {
        const { data: signed } = await supabase.storage
          .from('vaccination-docs')
          .createSignedUrl(fileName, 3600) // 1 hour
        signedUrl = signed?.signedUrl ?? rec.file_url
      } else {
        signedUrl = rec.file_url
      }
    }
    return { ...rec, signedUrl }
  }))

  return NextResponse.json({ records })
}

// PATCH /api/admin/vaccines — approve a record and update the pet's vaccine_status
export async function PATCH(req: NextRequest) {
  const supabase = getAdminClient()
  const { recordId, adminNotes } = await req.json()
  if (!recordId) return NextResponse.json({ error: 'Record ID required' }, { status: 400 })

  // 1. Get the record to find the pet_id
  const { data: record, error: recErr } = await supabase
    .from('vaccination_records')
    .select('pet_id')
    .eq('id', recordId)
    .single()
  if (recErr || !record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  // 2. Mark the record as verified
  const { error: updateErr } = await supabase
    .from('vaccination_records')
    .update({ verified: true, verified_at: new Date().toISOString(), admin_notes: adminNotes || null })
    .eq('id', recordId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 3. Update the pet's vaccine_status to verified
  const { error: petErr } = await supabase
    .from('pets')
    .update({ vaccine_status: 'verified' })
    .eq('id', record.pet_id)
  if (petErr) return NextResponse.json({ error: petErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
