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

const digitsOf = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-10)
// Placeholder numbers like the shared "Walk-In Customer" record (0000000000)
// are not real phones — never text them.
const isRealPhone = (d: string) => d.length === 10 && !/^(\d)\1{9}$/.test(d)

// Today's date in the salon's time zone, as YYYY-MM-DD.
function todayLA() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round((Date.parse(toYmd + 'T00:00:00Z') - Date.parse(fromYmd + 'T00:00:00Z')) / 86400000)
}

type Recipient = {
  digits: string
  name: string
  firstName: string
  pets: string
  lastVisit: string | null
  daysSinceVisit: number | null
}

type Audience = {
  tagId?: string | null
  // Only clients whose most recent completed visit was at least this many days
  // ago (clients with no completed visit are left out). Clients with an
  // upcoming appointment are always left out when this is set.
  minDaysSinceVisit?: number | null
}

// Which client phone numbers (10-digit) have at least one pet carrying the
// given tag. Used to narrow a broadcast to a specific audience.
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
  return { phones: new Set(pets.map(p => digitsOf(p.client_phone)).filter(isRealPhone)), error: null }
}

// Build the recipient list for an audience: SMS-opted-in clients with a real
// phone, optionally narrowed by pet tag and/or time since last visit, with
// first name + pet names attached for {name}/{pet} personalization.
async function getRecipients(supabase: ReturnType<typeof getAdminClient>, audience: Audience) {
  const { data: clients, error } = await fetchAllRows<{ phone: string; name: string | null }>((from, to) =>
    supabase.from('clients').select('phone, name').eq('sms_consent', true).not('phone', 'is', null).range(from, to)
  )
  if (error) return { recipients: [] as Recipient[], error }

  const { data: pets, error: petsError } = await fetchAllRows<{ client_phone: string; name: string | null }>((from, to) =>
    supabase.from('pets').select('client_phone, name').range(from, to)
  )
  if (petsError) return { recipients: [] as Recipient[], error: petsError }
  const petsByPhone = new Map<string, string[]>()
  for (const p of pets) {
    const d = digitsOf(p.client_phone)
    const n = (p.name || '').trim()
    if (!n) continue
    petsByPhone.set(d, [...(petsByPhone.get(d) ?? []), n])
  }

  const today = todayLA()
  const lastVisit = new Map<string, string>()
  const hasUpcoming = new Set<string>()
  const { data: appts, error: apptError } = await fetchAllRows<{ client_phone: string; appointment_date: string; status: string | null }>((from, to) =>
    supabase.from('appointments').select('client_phone, appointment_date, status').range(from, to)
  )
  if (apptError) return { recipients: [] as Recipient[], error: apptError }
  for (const a of appts) {
    const d = digitsOf(a.client_phone)
    const status = (a.status || '').toLowerCase()
    if (status === 'completed') {
      const prev = lastVisit.get(d)
      if (!prev || a.appointment_date > prev) lastVisit.set(d, a.appointment_date)
    } else if (a.appointment_date >= today && !['cancelled', 'no_show'].includes(status)) {
      hasUpcoming.add(d)
    }
  }

  let tagPhones: Set<string> | null = null
  if (audience.tagId) {
    const { phones, error: tagError } = await getPhonesWithTag(supabase, audience.tagId)
    if (tagError) return { recipients: [] as Recipient[], error: tagError }
    tagPhones = phones
  }

  const seen = new Set<string>()
  const recipients: Recipient[] = []
  for (const c of clients) {
    const d = digitsOf(c.phone)
    if (!isRealPhone(d) || seen.has(d)) continue
    if (tagPhones && !tagPhones.has(d)) continue
    const lv = lastVisit.get(d) ?? null
    const days = lv ? daysBetween(lv, today) : null
    if (audience.minDaysSinceVisit && audience.minDaysSinceVisit > 0) {
      if (days === null || days < audience.minDaysSinceVisit) continue
      if (hasUpcoming.has(d)) continue
    }
    seen.add(d)
    const name = (c.name || '').trim()
    // A "name" that is really just a phone number isn't usable in a greeting.
    const firstName = /\d{4,}/.test(name) ? '' : name.split(/\s+/)[0] || ''
    const petNames = petsByPhone.get(d) ?? []
    recipients.push({
      digits: d,
      name,
      firstName,
      pets: petNames.length <= 2 ? petNames.join(' & ') : `${petNames.slice(0, -1).join(', ')} & ${petNames[petNames.length - 1]}`,
      lastVisit: lv,
      daysSinceVisit: days,
    })
  }
  recipients.sort((a, b) => (b.daysSinceVisit ?? -1) - (a.daysSinceVisit ?? -1))
  return { recipients, error: null }
}

// Fill {name} and {pet} in a message for one recipient. If a client has no
// usable name / pet on file, fall back to a friendly generic word so the
// text never shows a blank or a raw placeholder.
function personalize(message: string, r: Pick<Recipient, 'firstName' | 'pets'>) {
  const text = message
    .replace(/\{name\}/gi, r.firstName || 'there')
    .replace(/\{pet\}/gi, r.pets || 'your pup')
    .trim()
  // Promotional texts must tell people how to opt out — add it if the admin
  // didn't already write it (same wording as every other client text).
  return /\bSTOP\b/i.test(text) ? text : `${text}\nReply STOP to opt out.`
}

function parseAudience(src: { get(k: string): string | null } | Record<string, unknown>): Audience {
  const get = (k: string) => (typeof (src as { get?: unknown }).get === 'function'
    ? (src as { get(k: string): string | null }).get(k)
    : (src as Record<string, unknown>)[k]) as string | number | null | undefined
  const min = Number(get('minDaysSinceVisit') ?? 0)
  return {
    tagId: (get('tagId') as string) || null,
    minDaysSinceVisit: Number.isFinite(min) && min > 0 ? Math.floor(min) : null,
  }
}

// GET /api/admin/broadcast — how many clients would this reach right now?
// Optional ?tagId=<uuid> and/or ?minDaysSinceVisit=<n> narrow the audience.
// Add ?preview=1 to also get the recipient list (name, pets, last visit).
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const { recipients, error } = await getRecipients(supabase, parseAudience(searchParams))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (searchParams.get('preview')) {
    return NextResponse.json({
      count: recipients.length,
      recipients: recipients.map(r => ({ name: r.name, firstName: r.firstName, pets: r.pets, phone: r.digits, lastVisit: r.lastVisit, daysSinceVisit: r.daysSinceVisit })),
    })
  }
  return NextResponse.json({ count: recipients.length })
}

// POST /api/admin/broadcast — send a one-off message to the selected audience
// of SMS-opted-in clients. {name} and {pet} in the message are filled in per
// client. This is a real, irreversible send (same Twilio number and opt-out
// handling as every other client text) — the admin UI confirms with the
// recipient count before calling this. Every real send (not a test) is
// recorded to broadcast_log so there's a history of what went out and when.
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const body = await req.json()
  const { message, testPhone, tagName, audienceLabel } = body
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }
  const audience = parseAudience(body)

  // Test-send path: send the message to one number the admin provides
  // (bypassing the client list and sms_consent gate — it's a self-test), with
  // {name}/{pet} filled in from the first real recipient so it reads exactly
  // like what clients will get. Not logged to history.
  if (testPhone) {
    const digits = String(testPhone).replace(/\D/g, '')
    if (digits.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }
    let sample: Pick<Recipient, 'firstName' | 'pets'> = { firstName: '', pets: '' }
    if (/\{(name|pet)\}/i.test(message)) {
      const { recipients } = await getRecipients(supabase, audience)
      if (recipients[0]) sample = recipients[0]
    }
    const result = await sendSMS(`+1${digits}`, personalize(message, sample), 'broadcast-test')
    if (!result.success) {
      return NextResponse.json({ error: result.error?.toString() ?? 'Failed to send test message' }, { status: 500 })
    }
    return NextResponse.json({ test: true, sent: 1, failed: 0, total: 1 })
  }

  const { recipients: targets, error } = await getRecipients(supabase, audience)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let failed = 0
  const failures: { phone: string; error: string }[] = []

  // Send in small concurrent batches rather than one at a time (too slow for a
  // few hundred clients) or all at once (risks tripping Twilio's rate limit).
  const BATCH_SIZE = 8
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(c => sendSMS(`+1${c.digits}`, personalize(message, c), 'broadcast'))
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
      tag_id: audience.tagId || null,
      tag_name: audienceLabel || (audience.tagId ? (tagName || null) : null),
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
