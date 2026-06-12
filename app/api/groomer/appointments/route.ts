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
        size_tier,
        grooming_quality,
        checked_in_at,
        grooming_started_at,
        grooming_finished_at,
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

    return NextResponse.json({ appointments: appointments || [] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
