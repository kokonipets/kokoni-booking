import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
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
      `)
      .or(`assigned_groomer.eq.${filterValue},assigned_bather.eq.${filterValue}`)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('appointment_date', { ascending: true })

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

    return NextResponse.json({ appointments: appointmentsWithFirstVisit })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
