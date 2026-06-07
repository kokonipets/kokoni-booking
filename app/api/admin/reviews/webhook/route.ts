import { createSupabaseServer } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const formData = await request.formData()

    const fromNumber = formData.get('From') as string
    const messageBody = formData.get('Body') as string
    const twilioSid = formData.get('MessageSid') as string

    if (!fromNumber || !messageBody) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Find review record
    const { data: review } = await supabase
      .from('reviews')
      .select('*')
      .eq('client_phone', fromNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!review) {
      console.log(`No review found for phone: ${fromNumber}`)
      return Response.json({ success: true })
    }

    // Parse rating from message (1-5)
    const ratingMatch = messageBody.trim().match(/^[1-5]/)
    const rating = ratingMatch ? parseInt(ratingMatch[0]) : null

    if (rating) {
      // Update review with rating
      const { error: updateError } = await supabase
        .from('reviews')
        .update({
          rating,
          response_text: messageBody,
          rating_received_at: new Date().toISOString(),
          status: rating >= 4 ? 'positive' : 'negative'
        })
        .eq('id', review.id)

      if (updateError) throw updateError

      // Log activity
      await supabase
        .from('review_activity_log')
        .insert({
          review_id: review.id,
          action: 'rating_received',
          actor: 'system',
          details: { rating, fromNumber }
        })

      // Handle positive vs negative
      if (rating >= 4) {
        // Positive: send review links
        await handlePositiveReview(supabase, review, messageBody)
      } else {
        // Negative: request feedback
        await handleNegativeReview(supabase, review, messageBody)
      }

      // Store inbound message
      await supabase
        .from('sms_messages')
        .insert({
          direction: 'inbound',
          from_number: fromNumber,
          to_number: process.env.TWILIO_PHONE_NUMBER,
          body: messageBody,
          twilio_sid: twilioSid,
          client_phone: fromNumber
        })
    } else {
      // No valid rating, store message and ask for clarification
      await supabase
        .from('sms_messages')
        .insert({
          direction: 'inbound',
          from_number: fromNumber,
          to_number: process.env.TWILIO_PHONE_NUMBER,
          body: messageBody,
          twilio_sid: twilioSid,
          client_phone: fromNumber
        })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error processing review webhook:', error)
    return Response.json({ error: 'Failed to process webhook' }, { status: 500 })
  }
}

async function handlePositiveReview(
  supabase: ReturnType<typeof createClient>,
  review: any,
  messageBody: string
) {
  try {
    const { data: settings } = await supabase
      .from('review_settings')
      .select('*')
      .limit(1)
      .single()

    if (!settings) return

    // Send review links
    let reviewMessage = settings.positive_response_template

    const firstName = (review.client_name ?? '').split(' ')[0] || 'there'
    reviewMessage = reviewMessage.replace('{client_name}', firstName)

    if (settings.google_review_url) {
      reviewMessage = reviewMessage.replace('{google_url}', settings.google_review_url)
    }
    if (settings.yelp_business_url) {
      reviewMessage = reviewMessage.replace('{yelp_url}', settings.yelp_business_url)
    }

    const result = await sendSMS(review.client_phone, reviewMessage, 'reviewResponse')

    if (result.success) {
      await supabase
        .from('reviews')
        .update({
          review_link_sent: 'google,yelp',
          updated_at: new Date().toISOString()
        })
        .eq('id', review.id)

      await supabase
        .from('review_activity_log')
        .insert({
          review_id: review.id,
          action: 'review_links_sent',
          actor: 'system',
          details: { links: 'google,yelp' }
        })
    }
  } catch (error) {
    console.error('Error handling positive review:', error)
  }
}

async function handleNegativeReview(
  supabase: ReturnType<typeof createClient>,
  review: any,
  messageBody: string
) {
  try {
    const { data: settings } = await supabase
      .from('review_settings')
      .select('*')
      .limit(1)
      .single()

    if (!settings || !settings.alert_on_negative) return

    // Create alert
    const { error: alertError } = await supabase
      .from('review_alerts')
      .insert({
        review_id: review.id,
        client_phone: review.client_phone,
        client_name: review.client_name,
        rating: review.rating,
        feedback_text: messageBody,
        status: 'pending'
      })

    if (alertError) throw alertError

    // Send feedback request
    const result = await sendSMS(
      review.client_phone,
      settings.feedback_request_template.replace('{client_name}', (review.client_name ?? '').split(' ')[0] || 'there'),
      'feedbackRequest'
    )

    if (result.success) {
      await supabase
        .from('review_activity_log')
        .insert({
          review_id: review.id,
          action: 'feedback_request_sent',
          actor: 'system',
          details: { rating: review.rating }
        })
    }

    // Notify admin if configured
    if (settings.admin_alert_phone) {
      const adminNotification = `⚠️ Negative review alert! ${review.client_name} gave ${review.rating}★. Feedback: "${messageBody}"`
      await sendSMS(settings.admin_alert_phone, adminNotification, 'adminAlert')
    }
  } catch (error) {
    console.error('Error handling negative review:', error)
  }
}
