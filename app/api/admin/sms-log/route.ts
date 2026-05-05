import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'
import { getSmsMode } from '@/lib/sms'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
  const status = url.searchParams.get('status')  // filter: sent|suppressed|failed|redirected

  const sb = createSupabaseServer()
  let q = sb.from('sms_log').select('*').order('created_at', { ascending: false }).limit(limit)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const whitelist = (process.env.SMS_TEST_WHITELIST ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  return NextResponse.json({
    success: true,
    mode: getSmsMode(),
    whitelist,
    forward: process.env.SMS_TEST_FORWARD ?? null,
    logs: data ?? [],
  })
}
