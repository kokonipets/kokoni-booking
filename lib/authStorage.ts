// Role-scoped auth storage.
//
// Previously every login wrote a single `localStorage('auth')` key, so logging
// in as a groomer in the same browser overwrote the admin's stored identity
// (and vice-versa). We now also store the user under a role-specific key:
//   - admin            -> 'auth_admin'
//   - groomer / bather -> 'auth_groomer'
// The legacy 'auth' key is kept in sync for backward compatibility, and reads
// fall back to it, so existing sessions keep working.

type AnyUser = { role?: string; [k: string]: unknown }

function scopedKey(role?: string): 'auth_admin' | 'auth_groomer' | null {
  if (role === 'admin') return 'auth_admin'
  if (role === 'groomer' || role === 'bather') return 'auth_groomer'
  return null
}

/** Persist a logged-in user under both the legacy key and its role-scoped key. */
export function saveAuth(user: AnyUser): void {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify(user)
    localStorage.setItem('auth', json) // legacy / global (back-compat)
    const k = scopedKey(user.role)
    if (k) localStorage.setItem(k, json)
  } catch { /* ignore quota / serialization errors */ }
}

/** Raw stringified user for a given surface, preferring its scoped key. */
export function readAuthRaw(scope: 'admin' | 'groomer'): string | null {
  if (typeof window === 'undefined') return null
  const scoped = scope === 'admin' ? 'auth_admin' : 'auth_groomer'
  return localStorage.getItem(scoped) || localStorage.getItem('auth')
}

/** Clear the scoped key for a surface, and the legacy key only if it belongs to this scope. */
export function clearAuth(scope: 'admin' | 'groomer'): void {
  if (typeof window === 'undefined') return
  const scoped = scope === 'admin' ? 'auth_admin' : 'auth_groomer'
  localStorage.removeItem(scoped)
  try {
    const g = JSON.parse(localStorage.getItem('auth') || 'null') as AnyUser | null
    if (g && scopedKey(g.role) === scoped) localStorage.removeItem('auth')
  } catch { /* ignore */ }
}
