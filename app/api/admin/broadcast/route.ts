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

// Which client phone numbers (10-digit, no formatting) have at least one pet
// carrying the given tag. Used to narrow a broadcast to a specific audience
// (e.g. "Doodle" clients) instead of every opted-in client.
async function getPhonesWithTag(supabase: ReturnType<typeof getAdminClient>, tagId: string) {
  const { data, error } = await fetchAllRows<{ pet_id: string }>((from, to) =>
    supabase.from('pet_tags').select('pet_id').eq('tag_id', tagId).range(from, to)
  )
  if (error) return { phones: new Set<string>(), error }
  const petIds = data.map(r => r.pet_id)
  if (petIds.length === 0) return { phones: new Set<string>(), error: null }

  const { data: pets, error: petsError } = await fetchAllRows<{ client_phone: string }>((from, to) =>
    supabase.from('pets').select('client_phone').in('id', petIds).range(from, to)
  )
  if (petsError) return { phones: new Set<string>(), error: petsError }

  const phones = new Set(pets.map(p => (p.client_phone || '').replace(/\D/g, '')).filter(d => d.length === 10))
  return { phones, error: null }
}

// GET /api/admin/broadcast — how many clients would this reach right now?
// Pass ?tagId=<uuid> to preview the count for clients whose pet has that tag
// instead of everyone. Lets the admin see a recipient count before sending.
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const tagId = searchParams.get('tagId')

  const { data, error } = await getOptedInClients(supabase)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let targets = data.filter(c => (c.phone || '').replace(/\D/g, '').length === 10)

  if (tagId) {
    const { phones, error: tagError } = await getPhonesWithTag(supabase, tagId)
    if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 })
    targets = targets.filter(c => phones.has((c.phone || '').replace(/\D/g, '')))
  }

  return NextResponse.json({ count: targets.length })
}

// POST /api/admin/broadcast — send a one-off message to every client who has
// opted in to SMS (optionally narrowed to clients whose pet has a given tag).
// This is a real, irreversible send (same Twilio number and opt-out handling
// as every other client text) — the admin UI confirms with the recipient
// count before calling this. Every real send (not a test) is recorded to
// broadcast_log so there's a history of what went out and when.
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { message, testPhone, tagId, tagName } = await req.json()
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  // Test-send path: fire the same message at a single number the admin provides
  // (bypassing the client list and sms_consent gate — it's a self-test, not a
  // real client) so the announcement can be proofread on a phone before the
  // real send goes out to everyone. Not logged to history.
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

  let targets = clients
    .map(c => ({ ...c, digits: (c.phone || '').replace(/\D/g, '') }))
    .filter(c => c.digits.length === 10)

  if (tagId) {
    const { phones, error: tagError } = await getPhonesWithTag(supabase, tagId)
    if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 })
    targets = targets.filter(c => phones.has(c.digits))
  }

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

  // Record this send to history — best-effort; a logging failure shouldn't make
  // an otherwise-successful send look like it failed.
  try {
    await supabase.from('broadcast_log').insert({
      message,
      tag_id: tagId || null,
      tag_name: tagId ? (tagName || null) : null,
      sent_count: sent,
      failed_count: failed,
      total_count: targets.length,
    })
  } catch {
    // ignore — history is a convenience, not required for the send itself
  }

  return NextResponse.json({
    total: targets.length,
    sent,
    failed,
    failures: failures.slice(0, 20), // cap payload size if something goes badly wrong
  })
}
