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

// GET today's confirmed appointments with their checkin status
export async function GET() {
  const supabase = getAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      service,
      appointment_time,
      notes,
      clients ( name, phone ),
      pets ( name, breed ),
      dog_checkins ( id, status, updated_at )
    `)
    .eq('appointment_date', today)
    .eq('status', 'confirmed')
    .order('appointment_time', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ appointments })
}

// POST — update or create a dog's checkin status
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  const { appointmentId, status } = await req.json()

  // Check if checkin record exists
  const { data: existing } = await supabase
    .from('dog_checkins')
    .select('id')
    .eq('appointment_id', appointmentId)
    .single()

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('dog_checkins')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Create new
    const { error } = await supabase
      .from('dog_checkins')
      .insert({ appointment_id: appointmentId, status })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
