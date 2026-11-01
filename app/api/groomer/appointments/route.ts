import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { commissionableAmount, helperCut, ratesOn, loadRateHistory } from '@/lib/commission'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Supabase/PostgREST caps a single .select() at 1000 rows by default — page
// through .range() so the "first visit ever" lookup below doesn't silently
// miss older appointments once a client's history grows past 1000 rows.
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

export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staff_id')
  const staffName = searchParams.get('staff_name')

  if (!staffId && !staffName) {
    return NextResponse.json({ error: 'staff_id or staff_name required' }, { status: 400 })
  }

  try {
    // Fetch appointments assigned to this groomer/bather (by name if provided, else by id)
    const filterValue = staffName || staffId!
    // Match on first name too, so an appointment saved as "Wylie" still shows for the staff login "Wylie Shen"
    const namePattern = staffName ? `%${staffName.trim().split(/\s+/)[0].replace(/[,()%]/g, '')}%` : null
    const SELECT_BASE = `
        id,
        client_phone,
        service,
        appointment_date,
        appointment_time,
        status,
        created_at,
        confirmed_at,
        grooming_status,
        groomer_confirmed,
        assigned_groomer,
        assigned_bather,
        notes,
        notes_list,
        payment_amount,
        payment_method,
        payment_status,
        tip_amount,
        discount_amount,
        discount_label,
        discount_percent,
        discount_bearer,
        size_tier,
        grooming_quality,
        checked_in_at,
        grooming_started_at,
        grooming_finished_at,
        checked_out_at,
        clients (
          name,
          phone,
          email
        ),
        pets (
          id,
          name,
          breed,
          weight,
          photo_url
        )
      `
    const SELECT_WITH_HELPER = SELECT_BASE.replace('assigned_bather,', `assigned_bather,
        helper_groomer,
        helper_pay_type,
        helper_flat_amount,
        helper_commission_percent,
        helper_tip_percent,
        helper_status,`)
    const runQuery = (sel: string) => supabase
      .from('appointments')
      .select(sel)
      .or(namePattern ? `assigned_groomer.ilike.${namePattern},assigned_bather.ilike.${namePattern}` : `assigned_groomer.eq.${filterValue},assigned_bather.eq.${filterValue}`)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('appointment_date', { ascending: true })
    // Falls back to the old column list if the helper_* migration hasn't been run yet
    let res = await runQuery(SELECT_WITH_HELPER)
    if (res.error) res = await runQuery(SELECT_BASE)
    const appointments = res.data as unknown as any[] | null
    const error = res.error

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 })
    }

    // Detect first-time visits: mark only the appointment that is the client's
    // earliest EVER (mirrors app/api/admin/appointments/route.ts) so the
    // groomer app can show the same "⭐ First Visit" badge as the admin desk.
    let appointmentsWithFirstVisit = appointments || []
    if (appointmentsWithFirstVisit.length) {
      const phones = [...new Set(appointmentsWithFirstVisit.map((a: { client_phone: string }) => a.client_phone))]
      const { data: allAppts } = await fetchAllRows<{ client_phone: string; appointment_date: string }>((from, to) =>
        supabase
          .from('appointments')
          .select('client_phone, appointment_date')
          .in('client_phone', phones)
          .not('status', 'eq', 'cancelled')
          .order('appointment_date', { ascending: true })
          .range(from, to)
      )
      const firstDateByPhone: Record<string, string> = {}
      for (const a of (allAppts || [])) {
        if (!firstDateByPhone[a.client_phone] || a.appointment_date < firstDateByPhone[a.client_phone]) {
          firstDateByPhone[a.client_phone] = a.appointment_date
        }
      }
      appointmentsWithFirstVisit = appointmentsWithFirstVisit.map((a: { client_phone: string; appointment_date: string }) => ({
        ...a,
        is_new_client: firstDateByPhone[a.client_phone] === a.appointment_date,
      }))
    }

    // Appointments where this person was added as the HELPER (their pay comes out of the owner's share). Best-effort: empty if migration not run.
    let helperAppointments: unknown[] = []
    try {
      const helperCols = 'id, client_phone, appointment_date, appointment_time, service, status, created_at, grooming_status, groomer_confirmed, assigned_groomer, assigned_bather, notes, notes_list, payment_amount, payment_method, payment_status, tip_amount, discount_amount, discount_label, discount_percent, discount_bearer, size_tier, grooming_quality, checked_in_at, grooming_started_at, grooming_finished_at, checked_out_at, helper_groomer, helper_pay_type, helper_flat_amount, helper_commission_percent, helper_tip_percent, clients (name, phone, email), pets (id, name, breed, weight, photo_url)'
      const runHelper = (cols: string) => supabase
        .from('appointments')
        .select(cols)
        .or(namePattern ? `helper_groomer.ilike.${namePattern}` : `helper_groomer.eq.${filterValue}`)
        .in('status', ['confirmed', 'in_progress', 'completed'])
        .order('appointment_date', { ascending: true })
      let hr = await runHelper(helperCols + ', helper_status')
      if (hr.error) hr = await runHelper(helperCols) // helper_status column not migrated yet
      const he = hr.error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hd = hr.data as any[] | null
      if (!he && hd && hd.length) {
        // Work out what the helper earns on each one, using the OWNER's commission / tip-share rates on that date
        const owners = [...new Set((hd as { assigned_groomer: string | null }[]).map(x => x.assigned_groomer).filter(Boolean))] as string[]
        const { data: ownerRows } = await supabase.from('staff').select('name, commission_percent, tip_percent').in('name', owners)
        const hist = await loadRateHistory(supabase)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byName: Record<string, any> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of (ownerRows || []) as any[]) byName[o.name] = o
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: idRows } = await supabase.from('staff').select('id, name').in('name', owners) as any
        const idByName: Record<string, string> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (idRows || []) as any[]) idByName[r.name] = String(r.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        helperAppointments = (hd as any[]).map(x => {
          const o = x.assigned_groomer ? byName[x.assigned_groomer] : null
          const rates = o ? ratesOn({ ...o, rate_history: hist[idByName[x.assigned_groomer]] || [] }, x.appointment_date) : { commission: 0, tip: 0 }
          const ownerComm = commissionableAmount(parseFloat(x.payment_amount || '0'), parseFloat(x.discount_amount || '0'), x.discount_bearer) * rates.commission / 100
          const ownerTip = parseFloat(x.tip_amount || '0') * rates.tip / 100
          const cut = helperCut(x, ownerComm, ownerTip)
          return { ...x, helper_earn: { comm: cut.comm, tip: cut.tip } }
        })
      }
    } catch { /* column missing */ }

    // The logged-in staff member's CURRENT rates + rate history (so the groomer's earnings never rely on a stale login cache)
    let myRates: unknown = null
    try {
      const q = staffId
        ? await supabase.from('staff').select('id, name, commission_percent, tip_percent').eq('id', staffId).limit(1)
        : await supabase.from('staff').select('id, name, commission_percent, tip_percent').ilike('name', `${staffName!.trim().split(/\s+/)[0].replace(/[,()%]/g, '')}%`).limit(5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (q.data || []) as any[]
      const me = rows.find(r => String(r.name).toLowerCase() === (staffName || '').trim().toLowerCase()) || rows[0]
      if (me) {
        const hist = await loadRateHistory(supabase)
        myRates = { commission_percent: Number(me.commission_percent ?? 0), tip_percent: Number(me.tip_percent ?? 0), rate_history: hist[String(me.id)] || [] }
      }
    } catch { /* best effort */ }

    return NextResponse.json({ appointments: appointmentsWithFirstVisit, helper_appointments: helperAppointments, my_rates: myRates })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
