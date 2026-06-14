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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date') // YYYY-MM-DD

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

  // 3. Load all staff (groomers) and count who's working that day
  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, name, role, work_hours, days_off, special_hours')
    .eq('role', 'groomer')

  let availableGroomers = 0
  const totalGroomers = staffRows?.length ?? 0

  if (staffRows) {
    for (const s of staffRows) {
      const daysOff: string[] = s.days_off || []
      // If this specific date is a day off → not working
      if (daysOff.includes(dateStr)) continue

      // Check special_hours override for this date
      const specialHours: Record<string, { start: string; end: string }> = s.special_hours || {}
      if (specialHours[dateStr]) {
        // Has special hours for this date → working
        availableGroomers++
        continue
      }

      // Check regular work_hours for this day name
      const workHours: Record<string, { start: string; end: string }> = s.work_hours || {}
      const hasAnyWorkHours = Object.keys(workHours).length > 0

      if (!hasAnyWorkHours) {
        // No schedule configured → assume working every day (unless day off above)
        availableGroomers++
      } else if (workHours[dayName] && workHours[dayName].start && workHours[dayName].end) {
        // start/end stored as "HH:MM" (24h)
        const ws = parse24h(workHours[dayName].start)
        const we = parse24h(workHours[dayName].end)
        if (we > ws) availableGroomers++ // valid shift → working
      }
      // else: work_hours exists but this day not listed → not scheduled
    }
  }

  // 4. Load existing appointments for this date (non-cancelled)
  const { data: apptRows } = await supabase
    .from('appointments')
    .select('appointment_time, status')
    .eq('appointment_date', dateStr)
    .neq('status', 'cancelled')

  // Count bookings per time slot
  const bookedCount: Record<string, number> = {}
  if (apptRows) {
    for (const a of apptRows) {
      const t = (a.appointment_time as string).trim()
      bookedCount[t] = (bookedCount[t] || 0) + 1
    }
  }

  // 5. Filter: a slot is available if booked < availableGroomers
  //    If we couldn't determine groomer count, fall back to total groomers (no one marked off)
  const capacity = availableGroomers > 0 ? availableGroomers : Math.max(totalGroomers, 1)

  // Slots explicitly blocked for THIS date via the admin calendar
  const blockedSlotsForDate = new Set(
    blockedTimes.filter(b => b.date === dateStr).map(b => b.time)
  )

  const availableSlots = allSlots.filter(slot => {
    if (blockedSlotsForDate.has(slot)) return false
    const booked = bookedCount[slot] || 0
    return booked < capacity
  })

  return NextResponse.json({
    slots: availableSlots,
    groomer_count: availableGroomers,
    total_groomers: totalGroomers,
    capacity_used: capacity,
    day_name: dayName,
    booked: bookedCount,
    all_slots: allSlots,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  })
}
