import { NextRequest, NextResponse } from 'next/server'

const SQUARE_API = 'https://connect.squareup.com/v2'

function getHeaders() {
  return {
    'Square-Version': '2024-01-17',
    'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// POST /api/kiosk/terminal-checkout — create a Terminal checkout
export async function POST(req: NextRequest) {
  const { appointmentId, amountCents, note } = await req.json()
  if (!appointmentId || !amountCents) {
    return NextResponse.json({ error: 'appointmentId and amountCents required' }, { status: 400 })
  }

  const deviceId = process.env.SQUARE_TERMINAL_DEVICE_ID
  if (!deviceId) {
    return NextResponse.json({ error: 'Terminal device not configured yet' }, { status: 500 })
  }

  const idempotencyKey = `${appointmentId}-${Date.now()}`

  const body = {
    idempotency_key: idempotencyKey,
    checkout: {
      amount_money: { amount: amountCents, currency: 'USD' },
      reference_id: String(appointmentId),
      note: note || 'Pet Grooming',
      device_options: { device_id: deviceId },
      payment_options: { autocomplete: true },
    },
  }

  const res = await fetch(`${SQUARE_API}/terminals/checkouts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok || data.errors) {
    return NextResponse.json({ error: data.errors?.[0]?.detail || 'Square error' }, { status: 500 })
  }

  return NextResponse.json({ checkoutId: data.checkout.id })
}

// GET /api/kiosk/terminal-checkout?id=xxx — poll for checkout status
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const res = await fetch(`${SQUARE_API}/terminals/checkouts/${id}`, {
    headers: getHeaders(),
  })

  const data = await res.json()
  if (!res.ok || data.errors) {
    return NextResponse.json({ error: data.errors?.[0]?.detail || 'Square error' }, { status: 500 })
  }

  const status = data.checkout?.status // PENDING, IN_PROGRESS, CANCEL_REQUESTED, CANCELLED, COMPLETED
  const paymentIds = data.checkout?.payment_ids ?? []

  return NextResponse.json({ status, paymentIds })
}
