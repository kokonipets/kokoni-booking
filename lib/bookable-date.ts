import type { SupabaseClient } from '@supabase/supabase-js'

// Single source of truth for "can anyone book this date?" — used by booking,
// time-slot lookup and reschedule. FAILS CLOSED: if the date can't be read or the
// salon settings can't be loaded, the date is treated as NOT bookable, so a
// network hiccup can never let a closed day (e.g. Sunday) through.
export type BookableResult = { ok: true; iso: string } | { ok: false; status: number; error: string }

// "Only when <staff> is in" gate (Wylie splits her week between Kokoni and Unicorn).
// setting key: staff_gate = JSON { staff: string; services: string[] }. On days the named groomer is NOT
// working here (days_off, special_hours, work_hours — same rules slot capacity uses), the listed
// services (e.g. Puppy First Groom) can't be booked.
export type StaffGate = { staff: string; services: string[] }
export function parseStaffGate(raw: unknown): StaffGate | null {
  try {
    const o = typeof raw === 'string' && raw ? JSON.parse(raw) : null
    if (!o || typeof o !== 'object' || typeof o.staff !== 'string' || !o.staff.trim()) return null
    const services = Array.isArray(o.services) ? o.services.filter((x: unknown): x is string => typeof x === 'string') : []
    return services.length > 0 ? { staff: o.staff.trim(), services } : null
  } catch { return null }
}

type GateStaffRow = { name: string | null; first_name?: string | null; role?: string | null; is_active?: boolean | null; work_hours?: Record<string, { start: string; end: string }> | null; days_off?: string[] | null; special_hours?: Record<string, { start: string; end: string }> | null }
const gateFirst = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0].toLowerCase()
const GATE_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function staffWorksOn(rows: GateStaffRow[], staffName: string, iso: string): boolean {
  const want = gateFirst(staffName)
  const mine = rows.filter(s => (s.role ?? 'groomer') === 'groomer' && s.is_active !== false && (gateFirst(s.name) === want || gateFirst(s.first_name) === want))
  if (mine.length === 0) return true // staff not found → never lock customers out
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d, 12).getDay()
  const dayName = GATE_DAY_NAMES[dow === 0 ? 6 : dow - 1]
  return mine.some(s => {
    if ((s.days_off || []).includes(iso)) return false
    const sp = s.special_hours && s.special_hours[iso]
    if (sp && sp.start && sp.end) return sp.end > sp.start
    const wh = s.work_hours || {}
    if (Object.keys(wh).length === 0) return true
    const w = wh[dayName]
    return !!(w && w.start && w.end && w.end > w.start)
  })
}

export async function checkStaffGate(supabase: SupabaseClient, date: unknown, service?: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const dt = parseBookingDate(date)
  if (!dt || typeof service !== 'string' || !service) return { ok: true }
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const { data } = await supabase.from('salon_settings').select('value').eq('key', 'staff_gate').maybeSingle()
  const gate = parseStaffGate(data?.value)
  if (!gate || !gate.services.includes(service)) return { ok: true }
  const { data: rows } = await supabase.from('staff').select('name, first_name, role, is_active, work_hours, days_off, special_hours')
  if (staffWorksOn((rows || []) as GateStaffRow[], gate.staff, iso)) return { ok: true }
  return { ok: false, error: `This service is only available on days ${gate.staff} is in. Please pick another date, or call us.` }
}

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
    .in('key', ['open_days', 'blocked_dates_list', 'special_open_dates'])
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

  // Special Open Days (admin Settings) open a single date on a normally closed weekday.
  let specialOpen: string[] = []
  try { const so = settings.special_open_dates ? JSON.parse(settings.special_open_dates) : []; specialOpen = Array.isArray(so) ? so : [] } catch { specialOpen = [] }

  if ((!openDays.includes(dt.getDay()) && !specialOpen.includes(iso)) || blockedDates.includes(iso)) {
    return { ok: false, status: 400, error: 'Sorry, that date is not available for booking. Please pick another day.' }
  }
  return { ok: true, iso }
}

// ─── Date service rules (admin Settings → "Date Booking Rules") ──────────────────────────
// One-off rules for a single date: which services can be booked that day, and by whom.
// setting key: date_service_rules = JSON [{ date: 'YYYY-MM-DD', services: [{ id, who, groomer? }] }]
//   who = 'all'      → anyone (new + returning)
//   who = 'returning'→ only clients with at least one completed visit
//   who = 'groomer'  → only clients with a completed visit done by that groomer (first name, e.g. "Mia")
// On a date that has a rule, services NOT listed can't be booked that day. Dates without a rule
// are unaffected. Admin screens (no phone passed to /api/slots) are never restricted.
export type DateServiceWho = 'all' | 'returning' | 'groomer'
export type DateServiceEntry = { id: string; who: DateServiceWho; groomer?: string }
export type DateServiceRule = { date: string; services: DateServiceEntry[] }

export function parseDateServiceRules(raw: unknown): DateServiceRule[] {
  try {
    const list = typeof raw === 'string' && raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list
      .filter((r: DateServiceRule) => r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Array.isArray(r.services))
      .map((r: DateServiceRule) => ({
        date: r.date,
        services: r.services
          .filter(s => s && typeof s.id === 'string' && s.id)
          .map(s => ({
            id: s.id,
            who: (s.who === 'returning' || s.who === 'groomer') ? s.who : 'all' as DateServiceWho,
            groomer: typeof s.groomer === 'string' && s.groomer.trim() ? s.groomer.trim() : undefined,
          })),
      }))
  } catch { return [] }
}

export async function checkDateServiceRule(
  supabase: SupabaseClient, date: unknown, phone: unknown, service: unknown,
  opts: { requirePhone?: boolean } = {}
): Promise<{ ok: true } | { ok: false; error: string; code: 'not_offered' | 'returning' | 'groomer'; groomer?: string }> {
  const dt = parseBookingDate(date)
  if (!dt || typeof service !== 'string' || !service) return { ok: true }
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const { data } = await supabase.from('salon_settings').select('value').eq('key', 'date_service_rules').maybeSingle()
  const rule = parseDateServiceRules(data?.value).find(r => r.date === iso)
  if (!rule) return { ok: true }

  const entry = rule.services.find(s => s.id === service)
  if (!entry) return { ok: false, code: 'not_offered', error: 'This service is not offered on this date. Please pick another date or service, or call us.' }
  if (entry.who === 'all') return { ok: true }

  const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : ''
  if (!digits) return opts.requirePhone ? { ok: false, code: 'returning', error: 'This date is for returning customers only. Please pick another date, or call us.' } : { ok: true }

  let q = supabase.from('appointments').select('id', { count: 'exact', head: true })
    .eq('client_phone', digits).eq('status', 'completed')
  if (entry.who === 'groomer' && entry.groomer) {
    const first = entry.groomer.split(/\s+/)[0]
    q = q.ilike('assigned_groomer', `${first}%`)
  }
  const { count } = await q
  if ((count ?? 0) > 0) return { ok: true }
  const byGroomer = entry.who === 'groomer' && !!entry.groomer
  return {
    ok: false,
    code: byGroomer ? 'groomer' : 'returning',
    groomer: byGroomer ? entry.groomer : undefined,
    error: entry.who === 'groomer' && entry.groomer
      ? `On this date, this service is only for ${entry.groomer}'s returning clients. Please pick another date, or call us.`
      : 'On this date, this service is for returning customers only. Please pick another date, or call us.',
  }
}
