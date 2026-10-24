import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const SQUARE_API = 'https://connect.squareup.com/v2'
const TZ = 'America/Los_Angeles'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const sqHeaders = () => ({
  'Square-Version': '2024-01-17',
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
})
const r2 = (n: number) => Math.round(n * 100) / 100

// Start/end instants (ISO, UTC) of a Los Angeles calendar day.
function laDayRange(date: string) {
  const offsetFor = (d: string) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' })
      .formatToParts(new Date(`${d}T12:00:00Z`)).find(p => p.type === 'timeZoneName')?.value
    return name === 'PDT' ? '-07:00' : '-08:00'
  }
  const next = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  return {
    start: new Date(`${date}T00:00:00${offsetFor(date)}`).toISOString(),
    end: new Date(`${next}T00:00:00${offsetFor(next)}`).toISOString(),
  }
}

type Retail = { id: string; total: number; method: string; at: string | null; label: string }
async function fetchRetail(sb: ReturnType<typeof admin>, start: string, end: string): Promise<Retail[]> {
  const { data } = await sb.from('retail_sales').select('id, total, payment_method, paid_at, lines').eq('status', 'paid').gte('paid_at', start).lt('paid_at', end)
  return (data ?? []).map((r: { id: string; total: number | string; payment_method: string; paid_at: string | null; lines: { name: string; qty: number }[] | null }) => ({
    id: `r:${r.id}`, total: r2(parseFloat(String(r.total)) || 0), method: r.payment_method, at: r.paid_at,
    label: (r.lines ?? []).map(l => `${l.name}×${l.qty}`).join(', '),
  }))
}

type Sys = { id: string; phone: string; pet: string; client: string; total: number; amount: number; tip: number; at: string | null; method: string }
type Sq = { id: string; at: string; total: number; ref: string | null; gross?: number; refunded?: number }

async function fetchSquare(date: string): Promise<{ configured: boolean; payments: Sq[]; error?: string }> {
  if (!process.env.SQUARE_ACCESS_TOKEN) return { configured: false, payments: [] }
  const { start, end } = laDayRange(date)
  try {
    // Terminal checkouts carry our reference_id (the appointment id); map payment id -> reference.
    const refByPayment: Record<string, string> = {}
    const cr = await fetch(`${SQUARE_API}/terminals/checkouts/search`, {
      method: 'POST', headers: sqHeaders(),
      body: JSON.stringify({ query: { filter: { status: 'COMPLETED', created_at: { start_at: start, end_at: end } } }, limit: 100 }),
    })
    const cd = await cr.json()
    for (const c of cd.checkouts ?? []) for (const pid of c.payment_ids ?? []) if (c.reference_id) refByPayment[pid] = c.reference_id

    const payments: Sq[] = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ begin_time: start, end_time: end, sort_order: 'ASC', limit: '100' })
      if (cursor) qs.set('cursor', cursor)
      const pr = await fetch(`${SQUARE_API}/payments?${qs}`, { headers: sqHeaders() })
      const pd = await pr.json()
      if (!pr.ok || pd.errors) return { configured: true, payments, error: pd.errors?.[0]?.detail || 'Square error' }
      for (const p of pd.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        const gross = (p.total_money?.amount ?? p.amount_money?.amount ?? 0) / 100
        const refunded = (p.refunded_money?.amount ?? 0) / 100
        payments.push({ id: p.id, at: p.created_at, total: r2(gross - refunded), gross: r2(gross), refunded: r2(refunded), ref: refByPayment[p.id] || p.reference_id || null })
      }
      cursor = pd.cursor
      if (!cursor) break
    }
    return { configured: true, payments }
  } catch (e) {
    return { configured: true, payments: [], error: (e as Error).message }
  }
}

function matchCards(sys: Sys[], sq: Sq[]) {
  type M = { squares: Sq[]; items: Sys[]; how: string }
  const matched: M[] = []
  const differs: { squares: Sq[]; items: Sys[] }[] = []
  const used = new Set<string>()
  const sqLeft: Sq[] = []
  const sum = (xs: { total: number }[]) => r2(xs.reduce((t, x) => t + x.total, 0))

  // Pass A: payments that carry an appointment reference are grouped by that client's phone
  // (one client can pay for several dogs in one or several swipes).
  const byPhone = new Map<string, Sq[]>()
  for (const p of sq) {
    const ref = p.ref ? sys.find(s => s.id === p.ref) : undefined
    if (!ref) { sqLeft.push(p); continue }
    byPhone.set(ref.phone, [...(byPhone.get(ref.phone) ?? []), p])
  }
  for (const [phone, pays] of byPhone) {
    const mine = sys.filter(s => s.phone === phone)
    const payLeft: Sq[] = []
    // 1) exact one-to-one amounts first
    for (const p of pays) {
      const hit = mine.find(s => !used.has(s.id) && Math.abs(s.total - p.total) < 0.01)
      if (hit) { used.add(hit.id); matched.push({ squares: [p], items: [hit], how: 'appointment ID' }) }
      else payLeft.push(p)
    }
    // 2) what is left: the same money may have been swiped in a different split
    const sysLeft = mine.filter(s => !used.has(s.id))
    if (payLeft.length && sysLeft.length) {
      sysLeft.forEach(s => used.add(s.id))
      if (Math.abs(sum(sysLeft) - sum(payLeft)) < 0.01) matched.push({ squares: payLeft, items: sysLeft, how: 'same client, total matches' })
      else differs.push({ squares: payLeft, items: sysLeft })
    } else sqLeft.push(...payLeft)
  }
  // Pass B: no reference — guess by identical amount and closest time (within 90 minutes).
  const squareOnly: Sq[] = []
  for (const p of sqLeft) {
    const cands = sys.filter(s => !used.has(s.id) && Math.abs(s.total - p.total) < 0.01 && s.at && Math.abs(Date.parse(s.at) - Date.parse(p.at)) <= 90 * 60000)
      .sort((x, y) => Math.abs(Date.parse(x.at!) - Date.parse(p.at)) - Math.abs(Date.parse(y.at!) - Date.parse(p.at)))
    if (cands[0]) { used.add(cands[0].id); matched.push({ squares: [p], items: [cands[0]], how: 'amount + time (guess)' }) }
    else squareOnly.push(p)
  }
  const systemOnly = sys.filter(s => !used.has(s.id))
  return { matched, differs, squareOnly, systemOnly }
}

// GET /api/admin/daily-close?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  // Month overview: which days have payments, and which of those are signed off.
  const month = req.nextUrl.searchParams.get('month')
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const sb = admin()
    const [y, mo] = month.split('-').map(Number)
    const first = `${month}-01`
    const last = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`
    const methodsList = ['card', 'cash', 'zelle', 'venmo']
    const perDay: Record<string, { count: number; revenue: number; tips: number; byMethod: Record<string, number> }> = {}
    for (let from = 0; ; from += 1000) {
      const MCOLS = 'appointment_date, payment_method, payment_amount, tip_amount, tip_method'
      const monthQ = (cols: string) => sb.from('appointments').select(cols)
        .gte('appointment_date', first).lte('appointment_date', last).eq('payment_status', 'paid')
        .order('appointment_date').order('id').range(from, from + 999)
      let { data: rows, error } = await monthQ(MCOLS + ', extra_tip_amount, extra_tip_method')
      if (error) ({ data: rows, error } = await monthQ(MCOLS)) // extra-tip columns not migrated yet
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      type MRow = { appointment_date: string; payment_method: string | null; payment_amount: string | null; tip_amount: number | string | null; tip_method: string | null; extra_tip_amount?: number | string | null; extra_tip_method?: string | null }
      for (const a of (rows ?? []) as unknown as MRow[]) {
        const m = a.payment_method && methodsList.includes(a.payment_method) ? a.payment_method : null
        if (!m) continue
        const amount = parseFloat(a.payment_amount ?? '') || 0
        const tip = parseFloat(String(a.tip_amount ?? '')) || 0
        const tipTo = a.tip_method && methodsList.includes(a.tip_method) ? a.tip_method : m
        const d = (perDay[a.appointment_date] ??= { count: 0, revenue: 0, tips: 0, byMethod: { card: 0, cash: 0, zelle: 0, venmo: 0 } })
        d.count++; d.revenue = r2(d.revenue + amount); d.tips = r2(d.tips + tip)
        const ex = Math.min(parseFloat(String(a.extra_tip_amount ?? '')) || 0, tip)
        const exTo = a.extra_tip_method && methodsList.includes(a.extra_tip_method) ? a.extra_tip_method : 'cash'
        d.byMethod[m] = r2(d.byMethod[m] + amount); d.byMethod[tipTo] = r2(d.byMethod[tipTo] + (tip - ex))
        if (ex > 0) d.byMethod[exTo] = r2(d.byMethod[exTo] + ex)
      }
      if (!rows || rows.length < 1000) break
    }
    {
      const r0 = laDayRange(first), r1 = laDayRange(last)
      for (const r of await fetchRetail(sb, r0.start, r1.end)) {
        const m = methodsList.includes(r.method) ? r.method : null
        if (!m || !r.at) continue
        const day = new Date(r.at).toLocaleDateString('en-CA', { timeZone: TZ })
        if (day < first || day > last) continue
        const d = (perDay[day] ??= { count: 0, revenue: 0, tips: 0, byMethod: { card: 0, cash: 0, zelle: 0, venmo: 0 } })
        d.count++; d.revenue = r2(d.revenue + r.total); d.byMethod[m] = r2(d.byMethod[m] + r.total)
      }
    }
    const { data: closings } = await sb.from('daily_closings').select('close_date, signed_by, signed_at, snapshot, notes').gte('close_date', first).lte('close_date', last)
    const byClose = new Map((closings ?? []).map(c => [c.close_date as string, c]))
    const days: Record<string, unknown> = {}
    const dates = new Set([...Object.keys(perDay), ...byClose.keys()])
    for (const d of dates) {
      const t = perDay[d]; const c = byClose.get(d)
      let changed = false
      if (c?.snapshot) {
        const snap = c.snapshot as Record<string, number>
        changed = methodsList.some(m => Math.abs((snap[m] ?? 0) - (t?.byMethod[m] ?? 0)) > 0.005)
      }
      days[d] = {
        count: t?.count ?? 0, revenue: t?.revenue ?? 0, tips: t?.tips ?? 0,
        signed: !!c, changed, signed_by: c?.signed_by ?? null, signed_at: c?.signed_at ?? null, has_note: !!c?.notes,
      }
    }
    return NextResponse.json({ month, days })
  }

  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date required' }, { status: 400 })
  const supabase = admin()

  const DAY_COLS = 'id, client_phone, payment_method, payment_amount, tip_amount, tip_method, checked_out_at, appointment_time, service, assigned_groomer, pets(name), clients(name)'
  const dayQ = (cols: string) => supabase.from('appointments').select(cols).eq('appointment_date', date).eq('payment_status', 'paid')
  let { data: rows, error } = await dayQ(DAY_COLS + ', extra_tip_amount, extra_tip_method')
  if (error) ({ data: rows, error } = await dayQ(DAY_COLS)) // extra-tip columns not migrated yet
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Service id -> display name (new services are stored under numeric ids like svc_1776…).
  const svcName: Record<string, string> = {}
  try {
    const { data: sv } = await supabase.from('salon_settings').select('value').eq('key', 'services').maybeSingle()
    for (const x of sv?.value ? JSON.parse(sv.value) : []) if (x?.id) svcName[x.id] = x.name || x.title || x.id
  } catch { /* fall back to ids */ }
  const methods = ['card', 'cash', 'zelle', 'venmo'] as const
  const totals: Record<string, { amount: number; tips: number; total: number; count: number; extraTips: number }> = {}
  for (const m of methods) totals[m] = { amount: 0, tips: 0, total: 0, count: 0, extraTips: 0 }
  const cardSys: Sys[] = []
  const report: { id: string; time: string | null; pet: string; client: string; service: string | null; groomer: string | null; method: string | null; amount: number; tip: number; tipMethod: string | null; extraTip: number; extraMethod: string | null; at: string | null }[] = []
  const lines: Record<string, { id: string; method: string; pet: string; client: string; total: number; at: string | null; tipOnly: boolean }[]> = { zelle: [], venmo: [] }
  for (const a of (rows ?? []) as unknown as {
    id: string; client_phone: string; payment_method: string | null; payment_amount: string | null; tip_amount: number | string | null
    tip_method: string | null; extra_tip_amount?: number | string | null; extra_tip_method?: string | null; checked_out_at: string | null; appointment_time: string | null; service: string | null; assigned_groomer: string | null; pets: { name: string } | { name: string }[] | null; clients: { name: string } | { name: string }[] | null
  }[]) {
    const amount = parseFloat(a.payment_amount ?? '') || 0
    const tip = parseFloat(String(a.tip_amount ?? '')) || 0
    report.push({
      id: a.id, time: a.appointment_time, service: a.service ? (svcName[a.service] ?? a.service) : a.service, groomer: a.assigned_groomer,
      pet: (Array.isArray(a.pets) ? a.pets[0]?.name : a.pets?.name) ?? '', client: (Array.isArray(a.clients) ? a.clients[0]?.name : a.clients?.name) ?? '',
      method: a.payment_method, amount, tip, tipMethod: a.tip_method, extraTip: Math.min(parseFloat(String(a.extra_tip_amount ?? '')) || 0, tip), extraMethod: a.extra_tip_method || 'cash', at: a.checked_out_at,
    })
    const m = a.payment_method && (methods as readonly string[]).includes(a.payment_method) ? a.payment_method : null
    if (!m) continue
    // The tip can be paid a different way than the service (e.g. service on card, tip in cash):
    // it belongs to the drawer / app it actually went through.
    const tipTo = a.tip_method && (methods as readonly string[]).includes(a.tip_method) ? a.tip_method : m
    // tip_amount is the TOTAL tip; an "extra" part (e.g. cash handed over on top of a card tip) goes
    // to its own method.
    const extra = Math.min(parseFloat(String(a.extra_tip_amount ?? '')) || 0, tip)
    const extraTo = a.extra_tip_method && (methods as readonly string[]).includes(a.extra_tip_method) ? a.extra_tip_method : 'cash'
    const mainTip = r2(tip - extra)
    const tipParts: Record<string, number> = {}
    if (mainTip > 0) tipParts[tipTo] = r2((tipParts[tipTo] ?? 0) + mainTip)
    if (extra > 0) tipParts[extraTo] = r2((tipParts[extraTo] ?? 0) + extra)
    const t = totals[m]
    t.amount = r2(t.amount + amount); t.total = r2(t.total + amount); t.count++
    for (const [meth, amt] of Object.entries(tipParts)) {
      const tt = totals[meth]
      tt.tips = r2(tt.tips + amt); tt.total = r2(tt.total + amt)
      if (meth !== m) tt.extraTips = r2(tt.extraTips + amt)
    }
    {
      const petN = Array.isArray(a.pets) ? a.pets[0]?.name : a.pets?.name
      const clN = Array.isArray(a.clients) ? a.clients[0]?.name : a.clients?.name
      if (m === 'zelle' || m === 'venmo') lines[m].push({ id: a.id, method: m, pet: petN ?? '', client: clN ?? '', total: r2(amount + (tipParts[m] ?? 0)), at: a.checked_out_at, tipOnly: false })
      for (const [meth, amt] of Object.entries(tipParts)) {
        if (meth !== m && (meth === 'zelle' || meth === 'venmo') && amt > 0) lines[meth].push({ id: a.id, method: meth, pet: petN ?? '', client: clN ?? '', total: r2(amt), at: a.checked_out_at, tipOnly: true })
      }
    }
    if (m === 'card') {
      const pet = Array.isArray(a.pets) ? a.pets[0]?.name : a.pets?.name
      const cl = Array.isArray(a.clients) ? a.clients[0]?.name : a.clients?.name
      cardSys.push({ id: a.id, phone: a.client_phone, pet: pet ?? '', client: cl ?? '', amount, tip, total: r2(amount + (tipParts.card ?? 0)), at: a.checked_out_at, method: 'card' })
    }
  }

  // Counter retail sales paid that day (tax-inclusive, no tip).
  {
    const { start, end } = laDayRange(date)
    for (const r of await fetchRetail(supabase, start, end)) {
      report.push({ id: r.id, time: null, service: r.label || '零售', groomer: '零售 Retail', pet: '零售 Retail', client: '', method: r.method, amount: r.total, tip: 0, tipMethod: null, extraTip: 0, extraMethod: null, at: r.at })
      const m = (methods as readonly string[]).includes(r.method) ? r.method : null
      if (!m) continue
      const t = totals[m]
      t.amount = r2(t.amount + r.total); t.total = r2(t.total + r.total); t.count++
      if (m === 'zelle' || m === 'venmo') lines[m].push({ id: r.id, method: m, pet: '零售 Retail', client: '', total: r.total, at: r.at, tipOnly: false })
      if (m === 'card') cardSys.push({ id: r.id, phone: `retail:${r.id}`, pet: '零售 Retail', client: '', amount: r.total, tip: 0, total: r.total, at: r.at, method: 'card' })
    }
  }

  // Visits that happened that day but have not been paid (so nothing slips through).
  const { data: unpaidRows } = await supabase
    .from('appointments')
    .select('id, appointment_time, service, assigned_groomer, status, pets(name), clients(name)')
    .eq('appointment_date', date).neq('payment_status', 'paid').in('status', ['confirmed', 'in_progress', 'completed'])
  const unpaid = ((unpaidRows ?? []) as unknown as { id: string; appointment_time: string | null; service: string | null; assigned_groomer: string | null; status: string; pets: { name: string } | { name: string }[] | null; clients: { name: string } | { name: string }[] | null }[]).map(u => ({
    id: u.id, time: u.appointment_time, service: u.service ? (svcName[u.service] ?? u.service) : u.service, groomer: u.assigned_groomer, status: u.status,
    pet: (Array.isArray(u.pets) ? u.pets[0]?.name : u.pets?.name) ?? '', client: (Array.isArray(u.clients) ? u.clients[0]?.name : u.clients?.name) ?? '',
  }))

  const lineIds = [...lines.zelle, ...lines.venmo].map(l => l.id)
  const verified = new Set<string>()
  if (lineIds.length) {
    const { data: vrows } = await supabase.from('payment_verifications').select('appointment_id, method').in('appointment_id', lineIds)
    for (const v of vrows ?? []) verified.add(`${v.appointment_id}|${v.method}`)
  }
  const verifyLines = {
    zelle: lines.zelle.map(l => ({ ...l, verified: verified.has(`${l.id}|${l.method}`) })),
    venmo: lines.venmo.map(l => ({ ...l, verified: verified.has(`${l.id}|${l.method}`) })),
  }

  const sq = await fetchSquare(date)
  const squareTotal = r2(sq.payments.reduce((t, p) => t + p.total, 0))  // net of refunds
  // Fully refunded charges net to $0: show them as information, not as an unmatched payment.
  const refundedPayments = sq.payments.filter(p => (p.refunded ?? 0) > 0 && p.total <= 0.004)
  const activePayments = sq.payments.filter(p => !refundedPayments.includes(p))
  const cardMatch = sq.configured && !sq.error ? { ...matchCards(cardSys, activePayments), refunded: refundedPayments } : null

  const { data: closing } = await supabase.from('daily_closings').select('*').eq('close_date', date).maybeSingle()
  let changedSinceClose = false
  if (closing?.snapshot) {
    const snap = closing.snapshot as Record<string, number>
    changedSinceClose = methods.some(m => Math.abs((snap[m] ?? 0) - totals[m].total) > 0.005)
  }

  return NextResponse.json({
    date, totals, verifyLines, report, unpaid,
    square: { configured: sq.configured, error: sq.error ?? null, total: squareTotal, count: sq.payments.length },
    cardMatch, closing, changedSinceClose,
  })
}

// POST /api/admin/daily-close  { date, signed_by, cash_counted, zelle_verified, venmo_verified, notes }
export async function POST(req: NextRequest) {
  const b = await req.json()

  // Tick / untick one Zelle or Venmo payment as checked against the bank / app.
  if (b.action === 'verify') {
    const sb = admin()
    if (!b.appointment_id || !['zelle', 'venmo'].includes(b.method)) return NextResponse.json({ error: 'bad request' }, { status: 400 })
    const q = b.verified
      ? sb.from('payment_verifications').upsert({ appointment_id: b.appointment_id, method: b.method, verified_by: String(b.by ?? '') || null, verified_at: new Date().toISOString() })
      : sb.from('payment_verifications').delete().eq('appointment_id', b.appointment_id).eq('method', b.method)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const date = String(b.date ?? '')
  const signedBy = String(b.signed_by ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !signedBy) return NextResponse.json({ error: 'date and signer name required' }, { status: 400 })

  // Re-read current totals so the stored snapshot is what the signer actually saw.
  const base = new URL(req.url)
  const res = await fetch(`${base.origin}/api/admin/daily-close?date=${date}`, { cache: 'no-store' })
  const cur = await res.json()
  if (cur.error) return NextResponse.json({ error: cur.error }, { status: 500 })
  const snapshot: Record<string, number> = {}
  for (const m of ['card', 'cash', 'zelle', 'venmo']) snapshot[m] = cur.totals[m].total

  const cash = b.cash_counted === '' || b.cash_counted == null ? null : parseFloat(b.cash_counted)
  const { error } = await admin().from('daily_closings').upsert({
    close_date: date,
    signed_by: signedBy,
    signed_at: new Date().toISOString(),
    cash_counted: cash != null && !isNaN(cash) ? cash : null,
    zelle_verified: cur.verifyLines.zelle.every((l: { verified: boolean }) => l.verified),
    venmo_verified: cur.verifyLines.venmo.every((l: { verified: boolean }) => l.verified),
    square_total: cur.square?.configured && !cur.square.error ? cur.square.total : null,
    snapshot,
    notes: String(b.notes ?? '').trim() || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
