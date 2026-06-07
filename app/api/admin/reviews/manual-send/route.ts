import { createSupabaseServer } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { clientPhone, clientName } = body

    if (!clientPhone) {
      return Response.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Normalize phone to 10 digits
    const digits = clientPhone.replace(/\D/g, '')
    const phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits

    if (phone.length !== 10) {
      return Response.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Get review settings
    const { data: settings } = await supabase
      .from('review_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!settings || !settings.review_request_template) {
      return Response.json({ error: 'Review settings not configured' }, { status: 400 })
    }

    const name = clientName?.trim() || 'valued customer'
    const firstName = name.split(' ')[0]
    const message = settings.review_request_template.replace('{client_name}', firstName)

    // Create a review record
    const { data: review, error: insertError } = await supabase
      .from('reviews')
      .insert({
        client_phone: phone,
        client_name: name,
        status: 'pending',
        review_request_sent_at: new Date().toISOString(),
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Send SMS (sendSMS mirrors it into sms_messages for the chat thread)
    const result = await sendSMS(phone, message, 'reviewRequest')

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 })
    }

    // Log activity
    await supabase.from('review_activity_log').insert({
      review_id: review.id,
      action: 'review_request_sent',
      actor: 'admin_manual',
      details: { clientPhone: phone, twilio_sid: result.sid, message },
    })

    return Response.json({ success: true, sid: result.sid })
  } catch (error) {
    console.error('Error sending manual review request:', error)
    return Response.json({ error: 'Failed to send review request' }, { status: 500 })
  }
}
