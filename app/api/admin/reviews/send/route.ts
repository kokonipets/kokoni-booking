import { createSupabaseServer } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { reviewId, clientPhone, clientName, appointmentId } = body

    // Get settings
    const { data: settings } = await supabase
      .from('review_settings')
      .select('*')
      .limit(1)
      .single()

    if (!settings) {
      return Response.json({ error: 'Settings not configured' }, { status: 400 })
    }

    // Prepare message
    const message = settings.review_request_template
      .replace('{client_name}', clientName || 'valued customer')

    // Send SMS
    const result = await sendSMS(clientPhone, message)

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 })
    }

    // Update review record
    const { error: updateError } = await supabase
      .from('reviews')
      .update({
        review_request_sent_at: new Date().toISOString(),
        attempt_count: 1,
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', reviewId)

    if (updateError) throw updateError

    // Log activity
    await supabase
      .from('review_activity_log')
      .insert({
        review_id: reviewId,
        action: 'review_request_sent',
        actor: 'admin',
        details: {
          clientPhone,
          twilio_sid: result.sid,
          message
        }
      })

    // Store SMS message
    await supabase
      .from('sms_messages')
      .insert({
        direction: 'outbound',
        from_number: process.env.TWILIO_PHONE_NUMBER,
        to_number: clientPhone,
        body: message,
        twilio_sid: result.sid,
        client_phone: clientPhone
      })

    return Response.json({
      success: true,
      sid: result.sid,
      message: 'Review request sent'
    })
  } catch (error) {
    console.error('Error sending review request:', error)
    return Response.json({ error: 'Failed to send review request' }, { status: 500 })
  }
}

// POST bulk review requests
export async function PUT(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { reviewIds } = body

    if (!reviewIds || !Array.isArray(reviewIds)) {
      return Response.json({ error: 'Invalid reviewIds' }, { status: 400 })
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const reviewId of reviewIds) {
      const { data: review } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', reviewId)
        .single()

      if (!review) {
        results.failed++
        results.errors.push(`Review ${reviewId} not found`)
        continue
      }

      // Send request
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/reviews/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId,
          clientPhone: review.client_phone,
          clientName: review.client_name,
          appointmentId: review.appointment_id
        })
      })

      if (response.ok) {
        results.sent++
      } else {
        results.failed++
        results.errors.push(`Failed to send to ${review.client_phone}`)
      }
    }

    return Response.json(results)
  } catch (error) {
    console.error('Error sending bulk review requests:', error)
    return Response.json({ error: 'Failed to send bulk requests' }, { status: 500 })
  }
}
