import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET() {
  const supabase = getAdminClient()

  const { data: pets } = await supabase
    .from('pets')
    .select('id, name, photo_url')

  // List files actually in the bucket
  const { data: files, error: listErr } = await supabase.storage
    .from('pet-photos')
    .list()

  return NextResponse.json({
    pets,
    bucketFiles: listErr ? listErr.message : files?.map(f => f.name),
  })
}
