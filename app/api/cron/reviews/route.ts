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

    // vercel.json fires this job once a day at several hours (3 PM–10 PM Los Angeles, both daylight-saving
    // offsets). It only actually sends in the hour chosen in Review Settings (default 8 PM), so the send
    // time stays adjustable and stays the same across DST. Add ?force=1 to run manually.
    const _laHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
    const _wantHour = Number.isFinite(Number(settings?.review_request_hour)) && settings?.review_request_hour != null ? Number(settings.review_request_hour) : 20
    if (_laHour !== _wantHour && !new URL(request.url).searchParams.get('force')) {
      return NextResponse.json({ skipped: true, laHour: _laHour, wantHour: _wantHour })
    }

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

    // New clients only: skip anyone who has a completed visit before today
    const phones = Array.from(new Set(appointments.map(a => a.client_phone).filter(Boolean)))
    const returning = new Set<string>()
    if (settings.new_clients_only === true && phones.length > 0) {
      const { data: prior } = await supabase
        .from('appointments')
        .select('client_phone')
        .in('client_phone', phones)
        .lt('appointment_date', todayStr)
        .in('status', ['checked_out', 'completed', 'paid'])
      for (const p of prior || []) returning.add(p.client_phone)
    }

    // Clients staff flagged as "already reviewed / don't ask again" (best effort — column may not exist yet)
    const optedOut = new Set<string>()
    if (phones.length > 0) {
      const { data: oc, error: ocErr } = await supabase.from('clients').select('phone').in('phone', phones).eq('review_opt_out', true)
      if (!ocErr) for (const c of (oc || []) as { phone: string }[]) optedOut.add(c.phone)
    }

    // "All clients" mode: don't ask the same customer again within N days
    const recentlyAsked = new Set<string>()
    const minDays = parseInt(String(settings.min_days_between_requests ?? ''), 10)
    if (settings.new_clients_only !== true && minDays > 0 && phones.length > 0) {
      const since = new Date(Date.now() - minDays * 86400000).toISOString()
      const { data: rr } = await supabase.from('reviews').select('client_phone').in('client_phone', phones).gte('review_request_sent_at', since)
      for (const r of (rr || []) as { client_phone: string }[]) recentlyAsked.add(r.client_phone)
    }
    const sentPhones = new Set<string>() // one message per owner per night (several dogs = one text)

    // Send review requests to eligible clients
    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const appt of appointments) {
      if (alreadySent.has(appt.id)) { skipped++; continue }
      if (returning.has(appt.client_phone) || optedOut.has(appt.client_phone) || recentlyAsked.has(appt.client_phone) || sentPhones.has(appt.client_phone)) { skipped++; continue }

      const clientData = appt.clients as { name: string; sms_consent: boolean } | null
      if (!clientData?.sms_consent) { skipped++; continue }

      const firstName = (clientData.name ?? 'there').split(' ')[0]
      const message = settings.review_request_template.replace('{client_name}', firstName).replace('{google_url}', settings.google_review_url ?? '').replace('{yelp_url}', settings.yelp_business_url ?? '')

      try {
        const result = await sendSMS(`+1${appt.client_phone}`, message, 'reviewRequest')

        if (result.success) {
          // Insert review record (check first to avoid duplicates)
          const { data: existing } = await supabase
            .from('reviews')
            .select('id')
            .eq('appointment_id', appt.id)
            .maybeSingle()

          if (!existing) {
            await supabase.from('reviews').insert({
              appointment_id: appt.id,
              client_phone: appt.client_phone,
              client_name: clientData.name,
              status: 'pending',
              review_request_sent_at: new Date().toISOString(),
              attempt_count: 1,
              last_attempt_at: new Date().toISOString()
            })
          } else {
            await supabase.from('reviews').update({
              review_request_sent_at: new Date().toISOString(),
              attempt_count: (existing as { attempt_count?: number }).attempt_count ?? 1,
              last_attempt_at: new Date().toISOString()
            }).eq('id', existing.id)
          }

          // (sendSMS mirrors the message into sms_messages — no duplicate insert)
          sentPhones.add(appt.client_phone)
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
