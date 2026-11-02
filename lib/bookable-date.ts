import type { SupabaseClient } from '@supabase/supabase-js'

// Single source of truth for "can anyone book this date?" — used by booking,
// time-slot lookup and reschedule. FAILS CLOSED: if the date can't be read or the
// salon settings can't be loaded, the date is treated as NOT bookable, so a
// network hiccup can never let a closed day (e.g. Sunday) through.
export type BookableResult = { ok: true; iso: string } | { ok: false; status: number; error: string }

export function parseBookingDate(date: unknown): Date | null {
  if (typeof date !== 'string') return null
  let dt: Date | null = null
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
    const [mm, dd, yy] = date.split('/').map(Number)
    dt = new Date(yy, mm - 1, dd, 12)
  } else if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [yy, mm, dd] = date.slice(0, 10).split('-').map(Number)
    dt = new Date(yy, mm - 1, dd, 12)
  }
  return dt && !isNaN(dt.getTime()) ? dt : null
}

export async function checkBookableDate(supabase: SupabaseClient, date: unknown): Promise<BookableResult> {
  const dt = parseBookingDate(date)
  if (!dt) return { ok: false, status: 400, error: 'Please pick a valid date.' }
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('salon_settings')
    .select('key, value')
    .in('key', ['open_days', 'blocked_dates_list'])
  const retry = { ok: false as const, status: 503, error: 'We could not check availability right now. Please try again in a moment.' }
  if (error || !data) return retry

  const settings: Record<string, string> = {}
  for (const r of data as { key: string; value: string }[]) settings[r.key] = r.value

  let openDays: number[]
  try {
    openDays = JSON.parse(settings.open_days)
    if (!Array.isArray(openDays) || openDays.length === 0) return retry
  } catch { return retry }

  let blockedDates: string[] = []
  try {
    const list = settings.blocked_dates_list ? JSON.parse(settings.blocked_dates_list) : []
    blockedDates = Array.isArray(list) ? list.map((b: { date: string }) => b.date) : []
  } catch { return retry }

  if (!openDays.includes(dt.getDay()) || blockedDates.includes(iso)) {
    return { ok: false, status: 400, error: 'Sorry, that date is not available for booking. Please pick another day.' }
  }
  return { ok: true, iso }
}
