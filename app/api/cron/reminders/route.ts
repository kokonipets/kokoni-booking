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

  // Vercel cron runs on UTC and is scheduled twice (summer + winter). Only run at 11:00 Los Angeles time,
  // so the send time stays the same across daylight-saving changes. Add ?force=1 to run manually.
  const _laHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  if (_laHour !== 11 && !new URL(req.url).searchParams.get('force')) {
    return NextResponse.json({ skipped: true, laHour: _laHour })
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

      // Claim this appointment so a repeated/overlapping run can never text the same client twice.
      // (If the reminder_sent_at column doesn't exist yet, skip the guard and send as before.)
      let claimed = false
      const claim = await supabase.from('appointments')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', appt.id).is('reminder_sent_at', null).select('id')
      if (!claim.error) {
        if (!claim.data || claim.data.length === 0) return { id: appt.id, skipped: 'already sent' }
        claimed = true
      }

      const result = await sendAppointmentReminder({
        to: `+1${phone}`,
        clientName,
        petName,
        service: appt.service,
        time: appt.appointment_time,
      })

      // Sending failed -> release the claim so a later run can retry
      if (claimed && (result as { success?: boolean })?.success === false) {
        await supabase.from('appointments').update({ reminder_sent_at: null }).eq('id', appt.id)
      }

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
