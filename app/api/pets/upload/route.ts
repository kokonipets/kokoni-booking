import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const BUCKET = 'pet-photos'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = getAdminClient()

  const { petId, fileBase64, contentType, ext } = await req.json()

  if (!petId || !fileBase64) {
    return NextResponse.json({ error: 'Missing petId or file data' }, { status: 400 })
  }

  const buffer = Buffer.from(fileBase64, 'base64')
  const path = `${petId}_${Date.now()}.${ext ?? 'jpg'}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('pets')
    .update({ photo_url: urlData.publicUrl })
    .eq('id', petId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ url: urlData.publicUrl })
}
