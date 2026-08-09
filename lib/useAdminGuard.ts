'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { readAuthRaw } from '@/lib/authStorage'

/**
 * Client-side guard for standalone admin pages (e.g. /admin/reviews,
 * /admin/timesheet) that live outside the main /admin/desk tab system and
 * its sidebar's `allowedTabs` filtering.
 *
 * Redirects to /login if not logged in as an admin, or to /admin/desk if
 * logged in but restricted (via staff.permissions.allowed_tabs, set in
 * /admin/settings) from the given tab key. Returns true once the check has
 * passed and it's safe to render the page; false while checking/redirecting.
 *
 * NOTE: this is a UI-level convenience guard only — the API routes these
 * pages call are not themselves auth-checked server-side, so it does not
 * stop a technically determined user from hitting the API directly. It does
 * stop normal navigation/URL-typing by a restricted staff account, which is
 * the realistic case this is meant to cover.
 */
export function useAdminGuard(tabKey: string): boolean {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let auth: { role?: string; username?: string } | null = null
      try { auth = JSON.parse(readAuthRaw('admin') || 'null') } catch { auth = null }
      if (auth?.role !== 'admin') { router.push('/login'); return }
      try {
        const res = await fetch('/api/admin/staff', { cache: 'no-store' })
        const data = await res.json()
        const me = (data.staff || []).find((s: { username?: string }) => s.username?.toLowerCase() === auth!.username?.toLowerCase())
        const allowed = me?.permissions?.allowed_tabs
        if (Array.isArray(allowed) && !allowed.includes(tabKey)) { router.push('/admin/desk'); return }
      } catch { /* fail open rather than locking the owner out if the check itself errors */ }
      if (!cancelled) setReady(true)
    })()
    return () => { cancelled = true }
  }, [router, tabKey])

  return ready
}
