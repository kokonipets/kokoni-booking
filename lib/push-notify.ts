import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Send a web push notification to all devices registered for a staff member.
 * Matches by exact name OR first-name prefix (e.g. "Wylie" matches "Wylie Shen").
 * Called directly — no HTTP round-trip needed.
 */
export async function sendPushToStaff(
  staffName: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_CONTACT_EMAIL ?? 'kokonipets@gmail.com'}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const supabase = getAdminClient()

    // Badge count = appointments this staff member still needs to accept
    // Includes: pending, rescheduled, OR confirmed-but-not-yet-groomer-confirmed
    const { count: rawCount } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .or(`assigned_groomer.eq.${staffName},assigned_bather.eq.${staffName}`)
      .in('status', ['pending', 'rescheduled', 'confirmed'])
      .eq('groomer_confirmed', false)

    // Always send at least 1 — never clear the badge via a push
    const badgeCount = Math.max(rawCount ?? 0, 1)

    // Match subscriptions by exact name OR first-name prefix
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .or(`staff_name.eq.${staffName},staff_name.ilike.${staffName} %`)

    if (!subs || subs.length === 0) return

    const payload = JSON.stringify({
      title,
      body,
      badgeCount,
      data,
    })

    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (err: unknown) {
          if ((err as { statusCode?: number }).statusCode === 410) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }
  } catch {
    // Fire-and-forget — never throw
  }
}

/**
 * Send a web push notification to all admin mobile devices.
 * Subscriptions are stored with staff_name = 'admin'.
 */
export async function sendPushToAdmin(
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_CONTACT_EMAIL ?? 'kokonipets@gmail.com'}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const supabase = getAdminClient()

    // Badge count = total pending requests
    const { count: rawCount } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    const badgeCount = Math.max(rawCount ?? 0, 1)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('staff_name', 'admin')

    if (!subs || subs.length === 0) return

    const payload = JSON.stringify({ title, body, badgeCount, data })

    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (err: unknown) {
          if ((err as { statusCode?: number }).statusCode === 410) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }
  } catch {
    // Fire-and-forget — never throw
  }
}
