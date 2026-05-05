import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const correctPin = process.env.ADMIN_PIN

  if (!correctPin) {
    return NextResponse.json({ error: 'ADMIN_PIN not configured' }, { status: 500 })
  }

  if (pin === correctPin) {
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: 'Incorrect PIN' }, { status: 401 })
}
