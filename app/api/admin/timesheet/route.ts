import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/timesheet?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=...
// Returns per-staff per-day hours within a date range (inclusive).
// Work = clock_in → clock_out with breaks subtracted.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const staffIdFilter = url.searchParams.get('staff_id')
  const tz = url.searchParams.get('tz') || 'America/Los_Angeles'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const sb = createSupabaseServer()

  // Load staff
  let staffQ = sb.from('staff').select('id, name, role, hourly_rate, pay_type').eq('is_active', true).order('name')
  if (staffIdFilter) staffQ = staffQ.eq('id', staffIdFilter)
  const { data: staff, error: sErr } = await staffQ
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  // Range: fetch a day before and after to handle cross-midnight shifts
  const fromISO = new Date(`${from}T00:00:00Z`).toISOString()
  // exclusive end = to + 1 day
  const toDate = new Date(`${to}T00:00:00Z`)
  toDate.setUTCDate(toDate.getUTCDate() + 2)
  const toISO = toDate.toISOString()

  let punchQ = sb
    .from('time_punches')
    .select('staff_id, action, punched_at')
    .gte('punched_at', fromISO)
    .lt('punched_at', toISO)
    .order('punched_at', { ascending: true })
  if (staffIdFilter) punchQ = punchQ.eq('staff_id', staffIdFilter)
  const { data: punches, error: pErr } = await punchQ
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  // Group punches by staff
  const byStaff = new Map<string, { action: string; punched_at: string }[]>()
  for (const p of punches ?? []) {
    const arr = byStaff.get(p.staff_id) ?? []
    arr.push({ action: p.action, punched_at: p.punched_at })
    byStaff.set(p.staff_id, arr)
  }

  // Build day buckets per staff
  const days = enumerateDates(from, to)
  const report = (staff ?? []).map(s => {
    const sPunches = byStaff.get(s.id) ?? []
    const sessions = buildSessions(sPunches)
    const dayRows = days.map(dateStr => {
      // Sum session minutes that fall on this local date
      const mins = sessions.reduce((sum, sess) => sum + minutesOnDate(sess, dateStr, tz), 0)
      const breakMins = sessions.reduce((sum, sess) => sum + breakMinutesOnDate(sess, dateStr, tz), 0)
      return {
        date: dateStr,
        work_minutes: Math.max(0, Math.round(mins)),
        break_minutes: Math.max(0, Math.round(breakMins)),
      }
    })
    const total = dayRows.reduce((a, r) => a + r.work_minutes, 0)
    return {
      staff_id: s.id,
      name: s.name,
      role: s.role,
      hourly_rate: (s as { hourly_rate?: number | null }).hourly_rate ?? null,
      pay_type: (s as { pay_type?: string | null }).pay_type ?? null,
      total_minutes: total,
      total_hours: +(total / 60).toFixed(2),
      days: dayRows,
    }
  })

  return NextResponse.json({ from, to, tz, report })
}

// ── helpers ─────────────────────────────────────────────────

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

type Session = {
  start: string   // clock_in ISO
  end: string | null  // clock_out ISO (null = still clocked in)
  breaks: { start: string; end: string | null }[]
}

function buildSessions(punches: { action: string; punched_at: string }[]): Session[] {
  const sessions: Session[] = []
  let current: Session | null = null
  for (const p of punches) {
    if (p.action === 'clock_in') {
      if (current) sessions.push(current)
      current = { start: p.punched_at, end: null, breaks: [] }
    } else if (p.action === 'clock_out') {
      if (current) {
        // close any open break at clock_out
        const openBreak = current.breaks.find(b => !b.end)
        if (openBreak) openBreak.end = p.punched_at
        current.end = p.punched_at
        sessions.push(current)
        current = null
      }
    } else if (p.action === 'break_start') {
      if (current) current.breaks.push({ start: p.punched_at, end: null })
    } else if (p.action === 'break_end') {
      if (current) {
        const openBreak = current.breaks.find(b => !b.end)
        if (openBreak) openBreak.end = p.punched_at
      }
    }
  }
  if (current) sessions.push(current)
  return sessions
}

/** Overlap (in minutes) between [start, end] and the calendar date (local tz). */
function overlapMinutes(startISO: string, endISO: string | null, dateStr: string, tz: string): number {
  const end = endISO ? new Date(endISO) : new Date()
  const dayStart = zonedDayStart(dateStr, tz)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const start = new Date(startISO)
  const lo = Math.max(start.getTime(), dayStart.getTime())
  const hi = Math.min(end.getTime(), dayEnd.getTime())
  return Math.max(0, (hi - lo) / 60000)
}

function minutesOnDate(sess: Session, dateStr: string, tz: string): number {
  const raw = overlapMinutes(sess.start, sess.end, dateStr, tz)
  // subtract break overlap
  const brk = sess.breaks.reduce((s, b) => s + overlapMinutes(b.start, b.end, dateStr, tz), 0)
  return Math.max(0, raw - brk)
}

function breakMinutesOnDate(sess: Session, dateStr: string, tz: string): number {
  return sess.breaks.reduce((s, b) => s + overlapMinutes(b.start, b.end, dateStr, tz), 0)
}

/** Returns UTC Date representing the start of `dateStr` in the given tz. */
function zonedDayStart(dateStr: string, tz: string): Date {
  // Build an ISO-ish string interpreted as local in tz, then compute UTC offset.
  // Simpler approach: parse as UTC, then shift by the tz offset at that instant.
  const asUtc = new Date(`${dateStr}T00:00:00Z`)
  const tzOffsetMins = getTzOffsetMinutes(asUtc, tz)
  return new Date(asUtc.getTime() - tzOffsetMins * 60 * 1000)
}

function getTzOffsetMinutes(at: Date, tz: string): number {
  // Difference between tz-local wall time and UTC wall time, in minutes.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(at)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (local - at.getTime()) / 60000
}
