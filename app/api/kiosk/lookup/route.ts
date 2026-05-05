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

// GET /api/kiosk/lookup?phone=xxx&mode=checkin|checkout
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const phone = req.nextUrl.searchParams.get('phone')?.replace(/\D/g, '')
  const mode = req.nextUrl.searchParams.get('mode') || 'checkin'
  // Use Pacific Time for "today" — UTC flips to next day after 5 PM PT
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })

  // Normalise: try raw digits, then with leading 1 stripped, then with 1 prepended
  const variants = [phone]
  if (phone.length === 11 && phone.startsWith('1')) variants.push(phone.slice(1))
  if (phone.length === 10) variants.push('1' + phone)

  // Build query based on mode
  let query = supabase
    .from('appointments')
    .select(`
      id,
      appointment_date,
      appointment_time,
      service,
      status,
      grooming_status,
      payment_amount,
      payment_method,
      payment_status,
      client_phone,
      assigned_groomer,
      assigned_bather,
      clients (name, phone, email),
      pets!pet_id (id, name, breed, weight, photo_url)
    `)
    .in('client_phone', variants)
    .eq('appointment_date', today)
    .not('status', 'in', '(cancelled,no_show)')
    .order('appointment_time', { ascending: true })

  if (mode === 'checkin') {
    // Check-in: only appointments that haven't been processed yet
    query = query.not('status', 'in', '(completed,in_progress)')
  } else {
    // Checkout: only appointments where the dog is actually ready or done
    query = query.or('grooming_status.eq.ready,grooming_status.eq.done,status.eq.completed')
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // DEBUG: also fetch ALL of today's appointments for this phone (no status filter)
  // so we can see what's in the DB vs what the filter is hiding
  const { data: debugData } = await supabase
    .from('appointments')
    .select('id, status, client_phone, appointment_date, pets!pet_id(name)')
    .in('client_phone', variants)
    .eq('appointment_date', today)

  if (!data || data.length === 0) {
    return NextResponse.json({
      appointment: null,
      appointments: [],
      _debug: { today, variants, found: 0, allToday: debugData }
    })
  }

  // Return ALL appointments for both check-in and checkout so customer can pick their pet
  return NextResponse.json({
    appointment: data[0],
    appointments: data,
    _debug: { today, variants, found: data.length, allToday: debugData }
  })
}
