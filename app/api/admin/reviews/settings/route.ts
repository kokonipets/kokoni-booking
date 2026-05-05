import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServer()

    // Just fetch the first settings record
    const { data: settings, error } = await supabase
      .from('review_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      console.error('Error fetching settings:', error)
      throw error
    }

    if (!settings || settings.length === 0) {
      return Response.json({ error: 'No settings found' }, { status: 404 })
    }

    return Response.json(settings[0])
  } catch (error) {
    console.error('Error fetching review settings:', error)
    return Response.json({ error: 'Failed to fetch settings', details: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()

    // Filter out any fields that aren't in the review_settings table
    const allowedFields = [
      'review_request_template',
      'positive_response_template',
      'feedback_request_template',
      'feedback_confirmation_template',
      'review_request_hour',
      'review_request_minute',
      'review_request_enabled',
      'google_place_id',
      'google_review_url',
      'yelp_business_url',
      'facebook_page_url',
      'alert_on_negative',
      'alert_threshold',
      'admin_alert_phone',
      'admin_alert_email',
      'max_retry_attempts',
      'retry_delay_hours'
    ]

    const updateData: any = { updated_at: new Date().toISOString() }

    for (const key of allowedFields) {
      if (key in body) {
        updateData[key] = body[key]
      }
    }

    // Get the settings ID
    const { data: settings } = await supabase
      .from('review_settings')
      .select('id')
      .limit(1)

    if (!settings || settings.length === 0) {
      return Response.json({ error: 'Settings not found' }, { status: 404 })
    }

    const settingsId = settings[0].id

    // Update settings
    const { data: updated, error } = await supabase
      .from('review_settings')
      .update(updateData)
      .eq('id', settingsId)
      .select()

    if (error) {
      console.error('Supabase update error:', JSON.stringify(error, null, 2))
      return Response.json({
        error: 'Failed to update settings',
        details: error.message,
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }

    return Response.json(updated && updated.length > 0 ? updated[0] : {})
  } catch (error: any) {
    console.error('Settings API error:', error)
    return Response.json({
      error: 'Failed to update settings',
      details: error?.message || String(error),
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 })
  }
}
