import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const phone = formData.get('phone') as string | null

  if (!file || !phone) {
    return NextResponse.json({ error: 'File and phone required' }, { status: 400 })
  }

  const supabase = createSupabaseServer()

  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${phone}_${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await supabase.storage
    .from('vaccination-docs')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('vaccination-docs')
    .getPublicUrl(fileName)

  return NextResponse.json({ url: urlData.publicUrl, fileName })
}
