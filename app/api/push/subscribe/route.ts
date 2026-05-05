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

// POST /api/push/subscribe — save or update a device push subscription
export async function POST(req: NextRequest) {
  try {
    const { staff_name, subscription } = await req.json()

    if (!staff_name || !subscription?.endpoint) {
      return NextResponse.json({ error: 'staff_name and subscription required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Upsert by endpoint so re-subscribing from the same device just updates the keys
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        staff_name,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? '',
      }, { onConflict: 'endpoint' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/push/subscribe — remove a device subscription (on logout)
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

    const supabase = getAdminClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
