import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendAppointmentReminder } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { appointmentId } = await req.json()
  if (!appointmentId) return NextResponse.json({ error: 'Missing appointmentId' }, { status: 400 })

  const { data: appt, error } = await supabase
    .from('appointments')
    .select(`
      id, client_phone, service, appointment_date, appointment_time,
      clients (name, sms_consent),
      pets (name)
    `)
    .eq('id', appointmentId)
    .single()

  if (error || !appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

  const phone = appt.client_phone?.replace(/\D/g, '')
  if (!phone || phone.length !== 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  // Block if client has not opted in (A2P 10DLC compliance)
  const clientData = appt.clients as { name: string; sms_consent: boolean } | null
  if (!clientData?.sms_consent) {
    return NextResponse.json({ error: 'Client has not opted in to SMS' }, { status: 403 })
  }

  const clientName = clientData.name ?? 'there'
  const petName = (appt.pets as { name: string } | null)?.name ?? 'your pet'

  // Format the date nicely for the message
  const dateLabel = new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  const result = await sendAppointmentReminder({
    to: `+1${phone}`,
    clientName,
    petName,
    service: appt.service,
    time: `${appt.appointment_time} on ${dateLabel}`,
  })

  return NextResponse.json(result)
}
