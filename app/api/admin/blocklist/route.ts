import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadBlocklist, saveBlocklist, phoneKey, BlockedClient } from '@/lib/blocklist'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// find a client's name by phone (matches any formatting of the same 10 digits)
async function clientNameFor(supabase: ReturnType<typeof db>, phone: string | null | undefined): Promise<string | null> {
  const k = phoneKey(phone)
  if (k.length < 10) return null
  const { data } = await supabase.from('clients').select('name').ilike('phone', `%${k.slice(0, 3)}%${k.slice(3, 6)}%${k.slice(6)}%`).limit(1)
  return (data && data[0]?.name) || null
}

// GET → the whole block list (newest first); GET ?lookup=phone → { name } of that client
export async function GET(req: NextRequest) {
  const supabase = db()
  const lookup = req.nextUrl.searchParams.get('lookup')
  if (lookup) return NextResponse.json({ name: await clientNameFor(supabase, lookup) })
  const list = await loadBlocklist(supabase)
  const out = await Promise.all(list.map(async b => ({ ...b, name: b.name || (await clientNameFor(supabase, b.phone)) })))
  return NextResponse.json({ blocked: out.sort((a, b) => b.added_at.localeCompare(a.added_at)) })
}

// POST { phone, name?, reason? } → add (or update the reason of) a blocked client
export async function POST(req: NextRequest) {
  const supabase = db()
  const body = await req.json().catch(() => ({}))
  const key = phoneKey(body.phone)
  if (key.length < 10) return NextResponse.json({ error: 'Enter a full 10-digit phone number.' }, { status: 400 })
  const by = decodeURIComponent(req.headers.get('x-actor-name') || '') || null
  const list = await loadBlocklist(supabase)
  const prev = list.find(b => phoneKey(b.phone) === key)
  const entry: BlockedClient = {
    phone: key,
    name: String(body.name || '').trim() || prev?.name || (await clientNameFor(supabase, key)) || null,
    reason: String(body.reason || '').trim() || null,
    added_at: prev?.added_at ?? new Date().toISOString(),
    added_by: prev?.added_by ?? by,
  }
  await saveBlocklist(supabase, [...list.filter(b => phoneKey(b.phone) !== key), entry])
  return NextResponse.json({ ok: true })
}

// DELETE ?phone= → remove from the block list
export async function DELETE(req: NextRequest) {
  const supabase = db()
  const key = phoneKey(req.nextUrl.searchParams.get('phone'))
  if (!key) return NextResponse.json({ error: 'phone required' }, { status: 400 })
  const list = await loadBlocklist(supabase)
  await saveBlocklist(supabase, list.filter(b => phoneKey(b.phone) !== key))
  return NextResponse.json({ ok: true })
}
