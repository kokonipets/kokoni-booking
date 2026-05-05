import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Handles both 12h ("9:00 AM") and 24h ("09:00") formats
function parseTime(t: string): number {
  if (!t) return NaN
  const upper = t.toUpperCase().trim()
  if (upper.includes('AM') || upper.includes('PM')) {
    const [time, period] = upper.split(' ')
    let [hours, minutes] = time.split(':').map(Number)
    if (isNaN(hours) || isNaN(minutes)) return NaN
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return hours * 60 + minutes
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

function generateSlots(
  openTime: string,
  closeTime: string,
  interval: number,
  blockedHours: { start: string; end: string }[]
): string[] {
  const slots: string[] = []
  const start = parseTime(openTime)
  const end = parseTime(closeTime)

  // Filter out any corrupted blocked hour entries (e.g. "11:NaN AM" from a previous save bug)
  const validBlocks = blockedHours.filter(b => {
    const bs = parseTime(b.start), be = parseTime(b.end)
    return !isNaN(bs) && !isNaN(be) && be > bs
  })
  for (let m = start; m < end; m += interval) {
    const isBlocked = validBlocks.some(b => {
      const bStart = parseTime(b.start)
      const bEnd = parseTime(b.end)
      return m >= bStart && m < bEnd
    })
    if (!isBlocked) slots.push(formatTime(m))
  }
  return slots
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const settingsRes = await supabase.from('salon_settings').select('*')

  const settings: Record<string, string> = {}
  settingsRes.data?.forEach(row => { settings[row.key] = row.value })

  const openDays: number[] = settings.open_days
    ? JSON.parse(settings.open_days)
    : [1, 2, 3, 4, 5, 6]

  const openTime = settings.open_time || '9:00 AM'
  const closeTime = settings.close_time || '4:00 PM'
  const interval = settings.appointment_interval ? parseInt(settings.appointment_interval) : 30

  let blockedHours: { start: string; end: string }[] = []
  try {
    blockedHours = settings.blocked_hours ? JSON.parse(settings.blocked_hours) : []
  } catch { blockedHours = [] }

  // Only return services visible to customers.
  // Checks EITHER the visible flag on each service OR the hidden_service_ids list.
  // A service is hidden if visible===false OR it appears in hidden_service_ids.
  let hiddenIds: string[] = []
  try {
    hiddenIds = settings.hidden_service_ids ? JSON.parse(settings.hidden_service_ids) : []
    if (!Array.isArray(hiddenIds)) hiddenIds = []
  } catch { hiddenIds = [] }

  // Return all services — visibility is managed separately in admin
  const services = settings.services ? JSON.parse(settings.services) : null

  let blockedDates: string[] = []
  try {
    const blockedList: { date: string; reason: string | null }[] = settings.blocked_dates_list
      ? JSON.parse(settings.blocked_dates_list)
      : []
    blockedDates = blockedList.map(b => b.date)
  } catch { blockedDates = [] }

  return NextResponse.json({
    open_days: openDays,
    open_time: openTime,
    close_time: closeTime,
    interval,
    blocked_hours: blockedHours,
    time_slots: generateSlots(openTime, closeTime, interval, blockedHours),
    blocked_dates: blockedDates,
    services,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  })
}
