import { NextResponse } from 'next/server'
import { getSmsMode } from '@/lib/sms'

export async function GET() {
  return NextResponse.json({
    mode: getSmsMode(),
    whitelist: (process.env.SMS_TEST_WHITELIST ?? '').split(',').map(s => s.trim()).filter(Boolean),
    forward: process.env.SMS_TEST_FORWARD ?? null,
  })
}
