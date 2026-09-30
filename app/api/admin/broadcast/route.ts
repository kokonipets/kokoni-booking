import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
// One-off announcement blasts can reach a few hundred clients; give this route
// more headroom than the default serverless timeout so a large list doesn't
// get cut off mid-send. (Capped by the hosting plan's own max regardless.)
export const maxDuration = 120

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Supabase/PostgREST caps an unbounded select() at 1000 rows — page through so
// a client list past that size doesn't silently lose people off the end.
const PAGE_SIZE = 1000
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) return { data: all, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

async function getOptedInClients(supabase: ReturnType<typeof getAdminClient>) {
  return fetchAllRows<{ phone: string; name: string }>((from, to) =>
    supabase
      .from('clients')
      .select('phone, name')
      .eq('sms_consent', true)
      .not('phone', 'is', null)
      .range(from, to)
  )
}

// GET /api/admin/broadcast — how many clients would this reach right now?
// Lets the admin see a recipient count before committing to an actual send.
export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await getOptedInClients(supabase)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const validCount = data.filter(c => (c.phone || '').replace(/\D/g, '').length === 10).length
  return NextResponse.json({ count: validCount })
}

// POST /api/admin/broadcast — send a one-off message to every client who has
// opted in to SMS. This is a real, irreversible send (same Twilio number and
// opt-out handling as every other client text) — the admin UI confirms with
// the recipient count before calling this.
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { message, testPhone } = await req.json()
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Test-send path: fire the same message at a single number the admin provides
  // (bypassing the client list and sms_consent gate — it's a self-test, not a
  // real client) so the announcement can be proofread on a phone before the
  // real send goes out to everyone.
  if (testPhone) {
    const digits = String(testPhone).replace(/\D/g, '')
    if (digits.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }
    const result = await sendSMS(`+1${digits}`, message, 'broadcast-test')
    if (!result.success) {
      return NextResponse.json({ error: result.error?.toString() ?? 'Failed to send test message' }, { status: 500 })
    }
    return NextResponse.json({ test: true, sent: 1, failed: 0, total: 1 })
  }

  const { data: clients, error } = await getOptedInClients(supabase)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets = clients
    .map(c => ({ ...c, digits: (c.phone || '').replace(/\D/g, '') }))
    .filter(c => c.digits.length === 10)

  let sent = 0
  let failed = 0
  const failures: { phone: string; error: string }[] = []

  // Send in small concurrent batches rather than one at a time (too slow for a
  // few hundred clients) or all at once (risks tripping Twilio's rate limit).
  const BATCH_SIZE = 8
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(c => sendSMS(`+1${c.digits}`, message, 'broadcast'))
    )
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.success) {
        sent++
      } else {
        failed++
        const err = r.status === 'fulfilled' ? (r.value.error?.toString() ?? 'unknown') : r.reason?.toString()
        failures.push({ phone: batch[idx].digits, error: err ?? 'unknown' })
      }
    })
    // Brief pause between batches so we don't hammer Twilio back-to-back.
    if (i + BATCH_SIZE < targets.length) await new Promise(r => setTimeout(r, 400))
  }

  return NextResponse.json({
    total: targets.length,
    sent,
    failed,
    failures: failures.slice(0, 20), // cap payload size if something goes badly wrong
  })
}
