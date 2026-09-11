import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Handles both 12h ("9:00 AM") and 24h ("09:00") formats
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
  // 24h "HH:MM"
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

// Parse 24h time "HH:MM" to minutes
function parse24h(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Parse a service-tier duration string ("1.5h", "20min", "90") into minutes.
// Mirrors the same parser used on the admin Recent Confirmed calendar.
function parseDurationStr(s?: string | null): number | null {
  if (!s) return null
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i)
  if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60)
  const mMatch = s.match(/(\d+)\s*m/i)
  if (mMatch) return parseInt(mMatch[1])
  const num = parseFloat(s)
  return isNaN(num) ? null : Math.round(num)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date') // YYYY-MM-DD
  const serviceId = searchParams.get('service') // optional — service being booked
  const sizeTier = searchParams.get('size_tier') // optional — pet size/weight bucket for the service being booked

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Load salon settings
  const { data: settingsRows } = await supabase.from('salon_settings').select('*')
  const settings: Record<string, string> = {}
  settingsRows?.forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })

  const openTime = settings.open_time || '9:00 AM'
  const closeTime = settings.close_time || '5:00 PM'
  const interval = settings.appointment_interval ? parseInt(settings.appointment_interval) : 15

  let blockedHours: { start: string; end: string }[] = []
  try { blockedHours = settings.blocked_hours ? JSON.parse(settings.blocked_hours) : [] } catch { blockedHours = [] }

  // Per-date / per-slot blocks set via the admin calendar "Block" button
  let blockedTimes: { date: string; time: string; reason: string | null }[] = []
  try { blockedTimes = settings.blocked_times_list ? JSON.parse(settings.blocked_times_list) : [] } catch { blockedTimes = [] }

  // Service definitions (with per-size-tier duration) — used both to let quick walk-in
  // services skip the capacity check entirely, and to know how long an EXISTING booked
  // appointment actually occupies a groomer (see step 4 below).
  type ServiceTierDef = { label: string; duration?: string }
  type ServiceDef = { id: string; skipCapacity?: boolean; tiers?: ServiceTierDef[] }
  let allServices: ServiceDef[] = []
  try { allServices = settings.services ? JSON.parse(settings.services) : [] } catch { allServices = [] }

  // Customer-facing weight buttons don't always match a given service's own tier labels
  // (e.g. Asian Fusion's tiers use different lb ranges than the generic weight picker), so an
  // exact label match often won't be found. When it isn't, fall back to the LONGEST duration
  // among that service's tiers rather than just the first one — better to occasionally hold a
  // slot open a bit too conservatively than to under-book a groomer's real time.
  const serviceDurationMin = (svcId: string, sizeTier?: string | null): number => {
    const svc = allServices.find(s => s.id === svcId)
    if (!svc?.tiers?.length) return 45
    const exactTier = sizeTier ? svc.tiers.find(t => t.label === sizeTier) : undefined
    const exactDur = exactTier ? parseDurationStr(exactTier.duration) : null
    if (exactDur != null) return exactDur
    const allDurations = svc.tiers.map(t => parseDurationStr(t.duration)).filter((d): d is number => d != null)
    return allDurations.length ? Math.max(...allDurations) : 45
  }

  // Real duration for an EXISTING appointment already on the books. Mirrors the admin
  // staff calendar's own fallback (first tier) when no size_tier was recorded — e.g. an
  // appointment added directly by staff without picking a weight/size — so a booking
  // occupies the SAME length of time here as it visibly does on the calendar staff see.
  // (serviceDurationMin above stays on the conservative "longest tier" fallback for a
  // NEW booking's own requested duration, since that guards against under-booking when a
  // customer-facing weight label doesn't exactly match this service's tier labels.)
  const existingApptDurationMin = (svcId: string, sizeTier?: string | null): number => {
    const svc = allServices.find(s => s.id === svcId)
    if (!svc?.tiers?.length) return 45
    const tier = (sizeTier ? svc.tiers.find(t => t.label === sizeTier) : undefined) || svc.tiers[0]
    return parseDurationStr(tier?.duration) ?? 45
  }

  // Walk-in quick services (e.g. Nail Trim, Top Dog) can be flagged in Settings to skip
  // the per-slot groomer capacity check entirely — they're in-and-out in minutes, so they
  // shouldn't be blocked just because the slot looks "full" of longer grooming appointments.
  const skipCapacityForService = serviceId ? !!allServices.find(s => s.id === serviceId)?.skipCapacity : false

  // Generate all store time slots, skipping any blocked periods
  // Guard against corrupted DB values (e.g. "11:NaN AM") by checking for NaN
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

  // If no date given, just return all slots (no capacity filter)
  if (!dateStr) {
    return NextResponse.json({ slots: allSlots, groomer_count: null, booked: {} }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  // 2. Figure out day name for the requested date
  // work_hours keys are day names: 'Monday','Tuesday',...,'Sunday'
  // matching the DAYS array in settings: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  // Date.getDay(): 0=Sun,1=Mon,...,6=Sat
  const [year, month, day] = dateStr.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)
  const dow = dateObj.getDay() // 0=Sunday … 6=Saturday
  const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  // settings DAYS array is Mon-indexed: getDay()==0 → index 6 ("Sunday"), getDay()==1 → index 0 ("Monday")
  const dayName = DAY_NAMES[dow === 0 ? 6 : dow - 1]

  // Store-wide recurring closed days (e.g. "Tuesday,Saturday") — if the store itself
  // isn't open this day of the week, nobody is actually working, no matter what's saved
  // in any individual staff member's work_hours / days_off.
  const closedDayNames = new Set(
    (settings.closed_days || '').split(',').map(d => d.trim()).filter(Boolean)
  )
  // One-off exceptions set in admin Business Settings ("Special Open Days") — lets the
  // salon open a single date (e.g. one Saturday) without changing the regular weekly
  // schedule for every other Saturday.
  let specialOpenDates: string[] = []
  try { specialOpenDates = settings.special_open_dates ? JSON.parse(settings.special_open_dates) : [] } catch { specialOpenDates = [] }
  const storeClosedToday = closedDayNames.has(dayName) && !specialOpenDates.includes(dateStr)

  // 3. Load all staff (groomers) and count who's working that day
  // is_active excludes deactivated/former staff — otherwise a groomer who was let go (or
  // simply never had work_hours configured) could still count toward capacity here even
  // though the admin schedule (and everyone's actual staffing) has already moved on without
  // them, silently opening slots nobody is really there to work.
  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, name, role, work_hours, days_off, special_hours')
    .eq('role', 'groomer')
    .eq('is_active', true)

  const totalGroomers = staffRows?.length ?? 0

  // Each groomer's actual working window for THIS specific date — special_hours (a one-day
  // override, e.g. "leaving early today") takes priority over their normal weekly work_hours.
  // Capacity is then computed per time slot from these real windows, not as one flat headcount
  // applied to the whole day — so a slot after everyone's shift has ended correctly shows full.
  const groomerWindows: ({ start: number; end: number } | null)[] = (staffRows || []).map(s => {
    const daysOff: string[] = s.days_off || []
    if (daysOff.includes(dateStr)) return null // day off → not working at all today

    const specialHours: Record<string, { start: string; end: string }> = s.special_hours || {}
    const special = specialHours[dateStr]
    if (special && special.start && special.end) {
      const ws = parse24h(special.start), we = parse24h(special.end)
      return we > ws ? { start: ws, end: we } : null
    }

    const workHours: Record<string, { start: string; end: string }> = s.work_hours || {}
    const hasAnyWorkHours = Object.keys(workHours).length > 0
    if (!hasAnyWorkHours) return { start: startMins, end: endMins } // no schedule configured → assume working full store hours

    const wh = workHours[dayName]
    if (wh && wh.start && wh.end) {
      const ws = parse24h(wh.start), we = parse24h(wh.end)
      if (we > ws) return { start: ws, end: we }
    }
    return null // work_hours exists but this day not listed → not scheduled
  })

  const availableGroomers = groomerWindows.filter(w => w !== null).length
  // Only fall back to "assume full capacity" when there's a genuine data gap — nobody
  // (zero staff rows) configured in the system at all. If real staff exist but are all
  // legitimately off *this specific day* (days off, a special_hours override, or just not
  // scheduled that weekday), that's a real 0-capacity day and must show as fully booked,
  // not wide open — so the fallback must NOT key off availableGroomers being 0.
  const noOneScheduledToday = totalGroomers === 0

  const capacityAtSlot = (slotMinutes: number): number => {
    if (noOneScheduledToday) return Math.max(totalGroomers, 1)
    return groomerWindows.filter(w => w !== null && slotMinutes >= w.start && slotMinutes < w.end).length
  }

  // 4. Load existing appointments for this date (non-cancelled)
  const { data: apptRows } = await supabase
    .from('appointments')
    .select('appointment_time, status, service, size_tier')
    .eq('appointment_date', dateStr)
    .neq('status', 'cancelled')

  // Count bookings per time slot (kept for the informational `booked` field in the response)
  const bookedCount: Record<string, number> = {}
  if (apptRows) {
    for (const a of apptRows) {
      const t = (a.appointment_time as string).trim()
      bookedCount[t] = (bookedCount[t] || 0) + 1
    }
  }

  // Each existing appointment occupies a groomer for its real service duration, not just its
  // exact starting slot — e.g. a 1.5h Asian Fusion booked at 9:30 is still occupying someone
  // at 10:00 and 10:30 too. Without this, a longer appointment only "blocked" the one slot it
  // started in, so the next slot or two could look wide open even though nobody was free.
  const apptWindows: { start: number; end: number }[] = (apptRows || []).map(a => {
    const start = parseTime((a.appointment_time as string).trim())
    const dur = existingApptDurationMin(a.service as string, (a as { size_tier?: string | null }).size_tier)
    return { start, end: start + dur }
  }).filter(w => !isNaN(w.start))

  const occupiedAtSlot = (slotMinutes: number): number =>
    apptWindows.filter(w => slotMinutes >= w.start && slotMinutes < w.end).length

  // 5. How long would THIS new booking itself take? A slot only 30 minutes wide can still
  //    be the start of a 2-hour appointment — the whole span needs to be checked, not just the
  //    instant it starts, or a slot could look open right up until it walks straight into
  //    closing time or into another appointment that starts later in that same window.
  const newApptDuration = serviceId ? serviceDurationMin(serviceId, sizeTier) : interval

  // Slots explicitly blocked for THIS date via the admin calendar
  const blockedSlotsForDate = new Set(
    blockedTimes.filter(b => b.date === dateStr).map(b => b.time)
  )

  const slotCapacity: Record<string, number> = {}
  const availableSlots = allSlots.filter(slot => {
    if (storeClosedToday) return false // store isn't open this day of the week at all
    const slotMin = parseTime(slot)
    const apptEnd = slotMin + newApptDuration

    // Must fully fit before closing — not just start before close
    if (apptEnd > endMins) return false

    // Must not run into a recurring blocked-hours range (e.g. "closed after 3 PM") at any
    // point during the appointment, not just at its start
    const crossesBlockedHours = validBlocks.some(b => {
      const bs = parseTime(b.start), be = parseTime(b.end)
      return slotMin < be && apptEnd > bs
    })
    if (crossesBlockedHours) return false

    // Must not run into a slot the admin explicitly blocked for this date, anywhere in its span
    const crossesBlockedSlot = Array.from(blockedSlotsForDate).some(t => {
      const tm = parseTime(t)
      return tm >= slotMin && tm < apptEnd
    })
    if (crossesBlockedSlot) return false

    if (skipCapacityForService) return true // walk-in quick service — capacity doesn't apply, but still respects hours/blocks above

    // Capacity must hold for every slot across the appointment's real duration, not just the
    // one it starts in — otherwise a 2-hour service could be booked right into a groomer who's
    // free right now but has another appointment starting 30 minutes later.
    for (let m = slotMin; m < apptEnd; m += interval) {
      if (occupiedAtSlot(m) >= capacityAtSlot(m)) return false
    }
    slotCapacity[slot] = capacityAtSlot(slotMin)
    return true
  })

  return NextResponse.json({
    slots: availableSlots,
    groomer_count: availableGroomers,
    total_groomers: totalGroomers,
    slot_capacity: slotCapacity,
    day_name: dayName,
    booked: bookedCount,
    all_slots: allSlots,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  })
}
