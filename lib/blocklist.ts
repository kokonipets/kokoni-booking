import type { SupabaseClient } from '@supabase/supabase-js'

// Block list ("黑名單"): clients we no longer take bookings from. Stored as JSON in
// salon_settings (key: blocked_clients) — no table / migration needed.
export type BlockedClient = { phone: string; name: string | null; reason: string | null; added_at: string; added_by: string | null }

const KEY = 'blocked_clients'

// Compare phones by their last 10 digits so "(714) 555-1234", "+17145551234" and "7145551234" match.
export const phoneKey = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10)

export async function loadBlocklist(supabase: SupabaseClient): Promise<BlockedClient[]> {
  const { data } = await supabase.from('salon_settings').select('value').eq('key', KEY).maybeSingle()
  if (!data?.value) return []
  try {
    const v = JSON.parse(data.value)
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export async function saveBlocklist(supabase: SupabaseClient, list: BlockedClient[]) {
  const { error } = await supabase.from('salon_settings').upsert({ key: KEY, value: JSON.stringify(list) }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

// Returns the block-list entry for this phone, or null. Never throws (a lookup problem must not stop a booking).
export async function findBlocked(supabase: SupabaseClient, phone: unknown): Promise<BlockedClient | null> {
  const k = phoneKey(phone)
  if (k.length < 7) return null
  try {
    const list = await loadBlocklist(supabase)
    return list.find(b => phoneKey(b.phone) === k) ?? null
  } catch { return null }
}
