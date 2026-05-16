import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Get review settings
    const { data: settings } = await supabase
      .from('review_settings')
      .select('*')
      .limit(1)
      .single()

    if (!settings?.review_request_enabled) {
      return NextResponse.json({ message: 'Review requests disabled' })
    }

    if (!settings.review_request_template) {
      return NextResponse.json({ error: 'No review request template configured' }, { status: 400 })
    }

    // Find today's completed/checked-out appointments that haven't had a review sent
    // Use Pacific time for "today"
    const nowPT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const todayStr = `${nowPT.getFullYear()}-${String(nowPT.getMonth() + 1).padStart(2, '0')}-${String(nowPT.getDate()).padStart(2, '0')}`

    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select(`
        id,
        client_phone,
        appointment_date,
        service,
        status,
        clients (name, sms_consent)
      `)
      .eq('appointment_date', todayStr)
      .in('status', ['checked_out', 'completed', 'paid'])

    if (apptError) throw apptError
    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ message: `No completed appointments for ${todayStr}`, sent: 0 })
    }

    // Check which ones already have a review request sent
    const apptIds = appointments.map(a => a.id)
    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('appointment_id')
      .in('appointment_id', apptIds)
      .not('review_request_sent_at', 'is', null)

    const alreadySent = new Set((existingReviews || []).map(r => r.appointment_id))

    // Send review requests to eligible clients
    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const appt of appointments) {
      if (alreadySent.has(appt.id)) { skipped++; continue }

      const clientData = appt.clients as { name: string; sms_consent: boolean } | null
      if (!clientData?.sms_consent) { skipped++; continue }

      const firstName = (clientData.name ?? 'there').split(' ')[0]
      const message = settings.review_request_template.replace('{client_name}', firstName)

      try {
        const result = await sendSMS(`+1${appt.client_phone}`, message)

        if (result.success) {
          // Upsert review record
          const { data: review } = await supabase
            .from('reviews')
            .upsert({
              appointment_id: appt.id,
              client_phone: appt.client_phone,
              client_name: clientData.name,
              status: 'pending',
              review_request_sent_at: new Date().toISOString(),
              attempt_count: 1,
              last_attempt_at: new Date().toISOString()
            }, { onConflict: 'appointment_id' })
            .select()
            .single()

          // Log SMS
          await supabase.from('sms_messages').insert({
            direction: 'outbound',
            from_number: process.env.TWILIO_PHONE_NUMBER,
            to_number: `+1${appt.client_phone}`,
            body: message,
            twilio_sid: result.sid,
            client_phone: appt.client_phone
          })

          sent++
        } else {
          errors.push(`${appt.client_phone}: ${result.error}`)
        }
      } catch (e) {
        errors.push(`${appt.client_phone}: ${String(e)}`)
      }
    }

    console.log(`Review requests: ${sent} sent, ${skipped} skipped for ${todayStr}`)
    return NextResponse.json({ date: todayStr, sent, skipped, errors })

  } catch (error) {
    console.error('Review cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
