import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendAppointmentReminder } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Vercel calls this at 10 AM PST every day (see vercel.json)
// It finds all confirmed appointments for TOMORROW and texts each client.
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel cron (or an admin manual trigger)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get tomorrow's date in YYYY-MM-DD format
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Find all confirmed appointments for tomorrow — only clients who opted in to SMS
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      client_phone,
      service,
      appointment_time,
      clients (name, sms_consent),
      pets (name)
    `)
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'confirmed')

  if (error) {
    console.error('Cron fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: `No confirmed appointments for ${tomorrowStr}` })
  }

  // Send a reminder to each client
  const results = await Promise.allSettled(
    appointments.map(async (appt) => {
      const phone = appt.client_phone?.replace(/\D/g, '')
      if (!phone || phone.length !== 10) return { id: appt.id, skipped: 'invalid phone' }

      // Skip clients who have not opted in to SMS (A2P 10DLC compliance)
      const clientData = appt.clients as { name: string; sms_consent: boolean } | null
      if (!clientData?.sms_consent) return { id: appt.id, skipped: 'no sms consent' }

      const clientName = (clientData.name ?? 'there').split(' ')[0]
      const petName = (appt.pets as { name: string } | null)?.name ?? 'your pet'

      const result = await sendAppointmentReminder({
        to: `+1${phone}`,
        clientName,
        petName,
        service: appt.service,
        time: appt.appointment_time,
      })

      return { id: appt.id, ...result }
    })
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  console.log(`Reminders sent: ${sent}/${appointments.length} for ${tomorrowStr}`)

  return NextResponse.json({
    date: tomorrowStr,
    total: appointments.length,
    sent,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }),
  })
}
