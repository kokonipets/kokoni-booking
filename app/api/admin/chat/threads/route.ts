import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Strip +1 / spaces / dashes → 10-digit
function toTenDigits(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// GET /api/admin/chat/threads
// Returns one row per conversation (grouped by the customer's phone) with the
// most-recent message preview and unread count.
export async function GET() {
  const sb = createSupabaseServer()

  const { data: msgs, error } = await sb
    .from('sms_messages')
    .select('id, created_at, direction, from_number, to_number, body, client_phone, read_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Msg = NonNullable<typeof msgs>[number]

  function customerPhone(m: Msg): string {
    return m.direction === 'inbound' ? m.from_number : m.to_number
  }

  const threads = new Map<
    string,
    {
      phone: string
      client_phone: string
      last_message: string
      last_message_at: string
      last_direction: 'inbound' | 'outbound'
      unread: number
    }
  >()

  for (const m of msgs ?? []) {
    const phone = customerPhone(m)
    const ten = m.client_phone ?? toTenDigits(phone)
    const existing = threads.get(ten)
    if (!existing) {
      threads.set(ten, {
        phone,
        client_phone: ten,
        last_message: m.body,
        last_message_at: m.created_at,
        last_direction: m.direction as 'inbound' | 'outbound',
        unread: m.direction === 'inbound' && !m.read_at ? 1 : 0,
      })
    } else {
      if (m.direction === 'inbound' && !m.read_at) existing.unread += 1
    }
  }

  // Hydrate client names by phone (10-digit match)
  const phones = Array.from(threads.keys()).filter(Boolean)
  const nameByPhone = new Map<string, string>()
  if (phones.length > 0) {
    const { data: clients } = await sb
      .from('clients')
      .select('name, phone')
      .in('phone', phones)
    for (const c of clients ?? []) {
      if (c.phone) nameByPhone.set(c.phone, c.name ?? '')
    }
  }

  const result = Array.from(threads.values()).map(t => ({
    ...t,
    client_name: nameByPhone.get(t.client_phone) ?? null,
  }))

  result.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))

  return NextResponse.json({ threads: result })
}
