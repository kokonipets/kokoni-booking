import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// ── Multi-dog "group booking" availability check ──────────────────────────
// A client with 2-3 dogs picks one nominal time T for the whole group. This
// endpoint answers: for each candidate T, can EVERY dog actually be given a
// real start time somewhere in [T, T+60min] — each with enough true
// continuous groomer capacity for its own full duration — accounting for
// both already-existing appointments AND the other dogs in this same group?
// It does NOT decide which groomer does which dog (same groomer back-to-back
// vs. two groomers in parallel) — that real staffing call is still made later
// by admin staff during confirmation, using the normal calendar. This is only
// a feasibility check so we never offer a group time slot that can't actually
// be staffed.
//
// This route is intentionally self-contained (duplicating helpers also found
// in app/api/slots/route.ts) — that mirrors the existing convention in this
// codebase where each slots-related route owns its own copy of these small
// parsing helpers rather than sharing a lib.

function parseTime(t: string): number {
  if (!t) return NaN
  const upper = t.toUpperCase().trim()
  if (upper.includes('AM') || upper.includes('PM')) {
    const [timePart, meridiem] = upper.split(' ')
    const [hStr, mStr] = timePart.split(':')
    let h = parseInt(hStr)
    const m = parseInt(mStr || '0')
    if (isNaN(h) || isNaN(m)) return NaN
    if (meridiem === 'PM' && h !== 12) h += 12
    if (meridiem === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const [hStr, mStr] = upper.split(':')
  const h = parseInt(hStr), m = parseInt(mStr || '0')
  if (isNaN(h) || isNaN(m)) return NaN
  return h * 60 + m
}

function formatTime(mins: number): string {
  let hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`
}

function parse24h(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function parseDurationStr(s?: string | null): number | null {
  if (!s) return null
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i)
  if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60)
  const mMatch = s.match(/(\d+)\s*m/i)
  if (mMatch) return parseInt(mMatch[1])
  const num = parseFloat(s)
  return isNaN(num) ? null : Math.round(num)
}

// How far past the customer's requested group time T a dog is still allowed
// to actually start — "客人約的是11:00～但設計師11:30才有空也可以約" (agreed
// as 60 minutes, up from an initially-discussed 30).
const GROUP_TOLERANCE_MIN = 60

type DogRequest = { service: string; size_tier?: string | null }
type DogAssignment = { index: number; start: string; startMin: number; duration: number; end: string }

export async function POST(req: NextRequest) {
  let body: { date?: string; dogs?: DogRequest[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const dateStr = body.date
  const dogs = body.dogs
  if (!dateStr || !Array.isArray(dogs) || dogs.length < 2) {
    return NextResponse.json({ error: 'date and at least 2 dogs are required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Salon settings (same as /api/slots)
  const { data: settingsRows } = await supabase.from('salon_settings').select('*')
  const settings: Record<string, string> = {}
  settingsRows?.forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })

  const openTime = settings.open_time || '9:00 AM'
  const closeTime = settings.close_time || '5:00 PM'
  const interval = settings.appointment_interval ? parseInt(settings.appointment_interval) : 15

  let blockedHours: { start: string; end: string }[] = []
  try { blockedHours = settings.blocked_hours ? JSON.parse(settings.blocked_hours) : [] } catch { blockedHours = [] }

  let blockedTimes: { date: string; time: string; reason: string | null }[] = []
  try { blockedTimes = settings.blocked_times_list ? JSON.parse(settings.blocked_times_list) : [] } catch { blockedTimes = [] }

  type ServiceTierDef = { label: string; duration?: string }
  type ServiceDef = { id: string; skipCapacity?: boolean; tiers?: ServiceTierDef[] }
  let allServices: ServiceDef[] = []
  try { allServices = settings.services ? JSON.parse(settings.services) : [] } catch { allServices = [] }

  // New-booking duration: same conservative "longest tier" fallback used for a single
  // new booking in /api/slots, so a group dog's own requested time isn't under-counted.
  const serviceDurationMin = (svcId: string, sizeTier?: string | null): number => {
    const svc = allServices.find(s => s.id === svcId)
    if (!svc?.tiers?.length) return 45
    const exactTier = sizeTier ? svc.tiers.find(t => t.label === sizeTier) : undefined
    const exactDur = exactTier ? parseDurationStr(exactTier.duration) : null
    if (exactDur != null) return exactDur
    const allDurations = svc.tiers.map(t => parseDurationStr(t.duration)).filter((d): d is number => d != null)
    return allDurations.length ? Math.max(...allDurations) : 45
  }

  // Existing appointment duration: first-tier fallback, mirrors the admin staff
  // calendar / /api/slots so this endpoint sees the SAME occupied windows admin does.
  const existingApptDurationMin = (svcId: string, sizeTier?: string | null): number => {
    const svc = allServices.find(s => s.id === svcId)
    if (!svc?.tiers?.length) return 45
    const tier = (sizeTier ? svc.tiers.find(t => t.label === sizeTier) : undefined) || svc.tiers[0]
    return parseDurationStr(tier?.duration) ?? 45
  }

  const allSlots: string[] = []
  const startMins = parseTime(openTime)
  const endMins = parseTime(closeTime)
  const validBlocks = blockedHours.filter(b => {
    const bs = parseTime(b.start), be = parseTime(b.end)
    return !isNaN(bs) && !isNaN(be) && be > bs
  })
  for (let m = startMins; m < endMins; m += interval) {
    const blocked = validBlocks.some(b => {
      const bs = parseTime(b.start), be = parseTime(b.end)
      return m >= bs && m < be
    })
    if (!blocked) allSlots.push(formatTime(m))
  }

  const [year, month, day] = dateStr.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)
  const dow = dateObj.getDay()
  const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  const dayName = DAY_NAMES[dow === 0 ? 6 : dow - 1]

  const closedDayNames = new Set(
    (settings.closed_days || '').split(',').map(d => d.trim()).filter(Boolean)
  )
  const storeClosedToday = closedDayNames.has(dayName)

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, name, role, work_hours, days_off, special_hours')
    .eq('role', 'groomer')

  const totalGroomers = staffRows?.length ?? 0

  const groomerWindows: ({ start: number; end: number } | null)[] = (staffRows || []).map(s => {
    const daysOff: string[] = s.days_off || []
    if (daysOff.includes(dateStr)) return null

    const specialHours: Record<string, { start: string; end: string }> = s.special_hours || {}
    const special = specialHours[dateStr]
    if (special && special.start && special.end) {
      const ws = parse24h(special.start), we = parse24h(special.end)
      return we > ws ? { start: ws, end: we } : null
    }

    const workHours: Record<string, { start: string; end: string }> = s.work_hours || {}
    const hasAnyWorkHours = Object.keys(workHours).length > 0
    if (!hasAnyWorkHours) return { start: startMins, end: endMins }

    const wh = workHours[dayName]
    if (wh && wh.start && wh.end) {
      const ws = parse24h(wh.start), we = parse24h(wh.end)
      if (we > ws) return { start: ws, end: we }
    }
    return null
  })

  const noOneScheduledToday = totalGroomers === 0
  const capacityAtSlot = (slotMinutes: number): number => {
    if (noOneScheduledToday) return Math.max(totalGroomers, 1)
    return groomerWindows.filter(w => w !== null && slotMinutes >= w.start && slotMinutes < w.end).length
  }

  const { data: apptRows } = await supabase
    .from('appointments')
    .select('appointment_time, status, service, size_tier')
    .eq('appointment_date', dateStr)
    .neq('status', 'cancelled')

  const apptWindows: { start: number; end: number }[] = (apptRows || []).map(a => {
    const start = parseTime((a.appointment_time as string).trim())
    const dur = existingApptDurationMin(a.service as string, (a as { size_tier?: string | null }).size_tier)
    return { start, end: start + dur }
  }).filter(w => !isNaN(w.start))

  const occupiedAtSlot = (slotMinutes: number): number =>
    apptWindows.filter(w => slotMinutes >= w.start && slotMinutes < w.end).length

  const blockedSlotsForDate = new Set(
    blockedTimes.filter(b => b.date === dateStr).map(b => b.time)
  )

  const crossesBlockedRange = (spanStart: number, spanEnd: number): boolean => {
    const crossesBlockedHours = validBlocks.some(b => {
      const bs = parseTime(b.start), be = parseTime(b.end)
      return spanStart < be && spanEnd > bs
    })
    if (crossesBlockedHours) return true
    return Array.from(blockedSlotsForDate).some(t => {
      const tm = parseTime(t)
      return tm >= spanStart && tm < spanEnd
    })
  }

  // Each dog's own requested duration, keeping track of its original position
  // in the request so the response can map assignments back to it.
  const dogDurations = dogs.map((d, index) => ({
    index,
    duration: serviceDurationMin(d.service, d.size_tier),
  }))

  // Try to fit every dog somewhere in [T, T+60min]. Longest-duration dog first —
  // it's the hardest to place, so placing it while the most room is still free
  // gives the best chance the whole group fits (a reasonable greedy heuristic;
  // this is a feasibility check, not the final staffing plan).
  const tryPlaceGroup = (T: number): DogAssignment[] | null => {
    const sorted = [...dogDurations].sort((a, b) => b.duration - a.duration)
    const placedWindows: { start: number; end: number }[] = []
    const assignment: DogAssignment[] = new Array(dogs.length)

    for (const dog of sorted) {
      let placedStart: number | null = null
      for (let candidateStart = T; candidateStart <= T + GROUP_TOLERANCE_MIN; candidateStart += interval) {
        const candidateEnd = candidateStart + dog.duration
        if (candidateEnd > endMins) continue
        if (crossesBlockedRange(candidateStart, candidateEnd)) continue

        let feasible = true
        for (let tick = candidateStart; tick < candidateEnd; tick += interval) {
          const occ = occupiedAtSlot(tick) + placedWindows.filter(w => tick >= w.start && tick < w.end).length
          if (occ >= capacityAtSlot(tick)) { feasible = false; break }
        }
        if (feasible) { placedStart = candidateStart; break }
      }
      if (placedStart == null) return null // this dog can't be placed → whole group infeasible for this T
      const end = placedStart + dog.duration
      placedWindows.push({ start: placedStart, end })
      assignment[dog.index] = { index: dog.index, start: formatTime(placedStart), startMin: placedStart, duration: dog.duration, end: formatTime(end) }
    }
    return assignment
  }

  const slots: string[] = []
  const assignments: Record<string, DogAssignment[]> = {}

  if (!storeClosedToday) {
    for (const slot of allSlots) {
      const T = parseTime(slot)
      // The nominal time itself must still be a real slot within business hours —
      // no need to also check it against blocked hours/slots here since allSlots
      // already excludes recurring-blocked ranges, and an admin-blocked single slot
      // is rare enough that tryPlaceGroup's per-dog check still catches any overlap.
      const assignment = tryPlaceGroup(T)
      if (assignment) {
        slots.push(slot)
        assignments[slot] = assignment
      }
    }
  }

  return NextResponse.json({
    slots,
    assignments,
    day_name: dayName,
    tolerance_minutes: GROUP_TOLERANCE_MIN,
    dog_durations: dogDurations.map(d => ({ index: d.index, duration: d.duration })),
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  })
}
