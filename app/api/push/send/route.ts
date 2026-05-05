import { NextRequest, NextResponse } from 'next/server'
import { sendPushToStaff } from '@/lib/push-notify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// POST /api/push/send — send push notification to all devices for a staff member
export async function POST(req: NextRequest) {
  try {
    const { staff_name, title, body, data } = await req.json()
    if (!staff_name || !title) {
      return NextResponse.json({ error: 'staff_name and title required' }, { status: 400 })
    }

    await sendPushToStaff(staff_name, title, body ?? '', data ?? {})
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
