import twilio from 'twilio'
import { createSupabaseServer } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Mode: 'live' | 'test' | 'off'
//   live  → sends to every recipient (production)
//   test  → only sends to numbers in SMS_TEST_WHITELIST; everyone else is logged,
//           not sent. Optionally SMS_TEST_FORWARD can redirect all messages to a
//           single number so you can verify content + delivery on your own phone.
//   off   → never sends anything; logs only
// ─────────────────────────────────────────────────────────────────────────────
type SmsMode = 'live' | 'test' | 'off'

function getMode(): SmsMode {
  const m = (process.env.SMS_MODE ?? 'test').toLowerCase()
  if (m === 'live' || m === 'test' || m === 'off') return m
  return 'test'
}

function getWhitelist(): string[] {
  return (process.env.SMS_TEST_WHITELIST ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function normalize(num: string): string {
  // strip anything that's not a digit or leading '+'
  const digits = num.replace(/[^\d+]/g, '')
  // crude +1 default for US 10-digit numbers
  if (!digits.startsWith('+') && digits.length === 10) return '+1' + digits
  if (!digits.startsWith('+') && digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return digits
}

// Lazy init — only create when actually sending, not at build time
function getClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )
}

export function getSmsMode(): SmsMode {
  return getMode()
}

// Mirror every customer-facing SMS into the chat conversation (sms_messages)
// so the admin Chat shows the complete history a client actually received.
// Admin-targeted notifications are skipped (they're not client conversations).
async function logChatMessage(entry: { to: string; body: string; template?: string | null; twilio_sid?: string | null }) {
  try {
    if (entry.template && /admin/i.test(entry.template)) return
    const toNorm = normalize(entry.to)
    const adminPhone = process.env.ADMIN_PHONE ? normalize(process.env.ADMIN_PHONE) : null
    if (adminPhone && toNorm === adminPhone) return
    const sb = createSupabaseServer()
    const row: Record<string, unknown> = {
      direction: 'outbound',
      from_number: process.env.TWILIO_PHONE_NUMBER ?? '',
      to_number: toNorm,
      body: entry.body,
      twilio_sid: entry.twilio_sid ?? null,
      client_phone: toNorm.replace(/\D/g, '').slice(-10),
      template: entry.template ?? null,
    }
    const { error } = await sb.from('sms_messages').insert(row)
    if (error) {
      // `template` column may not be migrated yet — retry without it
      delete row.template
      await sb.from('sms_messages').insert(row)
    }
  } catch (e) {
    console.error('[sms] chat mirror failed:', e)
  }
}

async function logSms(entry: {
  mode: SmsMode
  status: 'sent' | 'suppressed' | 'failed' | 'redirected'
  to_number: string
  actual_to?: string | null
  body: string
  template?: string | null
  twilio_sid?: string | null
  error?: string | null
  suppressed_reason?: string | null
}) {
  try {
    const sb = createSupabaseServer()
    await sb.from('sms_log').insert(entry)
  } catch (e) {
    console.error('[sms] log write failed:', e)
  }
}

export async function sendSMS(to: string, body: string, template?: string) {
  const mode = getMode()
  const toNorm = normalize(to)
  const whitelist = getWhitelist().map(normalize)
  const forward = process.env.SMS_TEST_FORWARD ? normalize(process.env.SMS_TEST_FORWARD) : null

  // ── OFF: log only ──
  if (mode === 'off') {
    await logSms({ mode, status: 'suppressed', to_number: toNorm, body, template, suppressed_reason: 'mode=off' })
    await logChatMessage({ to: toNorm, body, template })
    console.log(`[sms:off] would send to ${toNorm}: ${body.slice(0, 60)}…`)
    return { success: true, suppressed: true, mode }
  }

  // ── TEST: whitelist + optional forward ──
  let actualTo = toNorm
  let redirected = false
  if (mode === 'test') {
    if (forward) {
      // Route every SMS to your own phone, but prefix the body so you see who it was intended for
      actualTo = forward
      redirected = true
    } else if (!whitelist.includes(toNorm)) {
      await logSms({ mode, status: 'suppressed', to_number: toNorm, body, template, suppressed_reason: 'not-in-whitelist' })
      await logChatMessage({ to: toNorm, body, template })
      console.log(`[sms:test] suppressed (not in whitelist) to=${toNorm}`)
      return { success: true, suppressed: true, mode }
    }
  }

  const finalBody = redirected
    ? `[TEST → intended for ${toNorm}]\n${body}`
    : body

  try {
    const message = await getClient().messages.create({
      body: finalBody,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: actualTo,
    })
    await logSms({
      mode,
      status: redirected ? 'redirected' : 'sent',
      to_number: toNorm,
      actual_to: actualTo,
      body: finalBody,
      template,
      twilio_sid: message.sid,
    })
    await logChatMessage({ to: toNorm, body, template, twilio_sid: message.sid })
    return { success: true, sid: message.sid, mode, redirected }
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    await logSms({
      mode,
      status: 'failed',
      to_number: toNorm,
      actual_to: actualTo,
      body: finalBody,
      template,
      error: msg,
    })
    console.error('SMS error:', error)
    return { success: false, error, mode }
  }
}

// Notify admin of new booking request
export async function notifyAdminNewRequest(data: {
  clientName: string
  petName: string
  service: string
  date: string
  time: string
  phone: string
}) {
  const serviceLabels: Record<string, string> = {
    simply_cute: 'Simply Cute – Everyday Style',
    bath_brush: 'Bath & Brush',
    asian_fusion: 'Asian Fusion Style',
  }
  const body = `New Booking Request!\n${data.clientName} - ${data.petName}\n${serviceLabels[data.service] ?? data.service}\n${data.date} @ ${data.time}\n${data.phone}`
  return sendSMS(process.env.ADMIN_PHONE!, body, 'notifyAdminNewRequest')
}

// Notify client that booking is confirmed
export async function notifyClientConfirmed(data: {
  to: string
  clientName: string
  petName: string
  date: string
  time: string
}) {
  const body = `Appointment Confirmed!\nHi ${data.clientName}! ${data.petName}'s appointment is confirmed for ${data.date} at ${data.time}.\nKokoni Pet Grooming Salon - (626) 621-4646\nReply STOP to opt out.`
  return sendSMS(data.to, body, 'notifyClientConfirmed')
}

// Notify client that appointment was rescheduled
export async function notifyClientRescheduled(data: {
  to: string
  clientName: string
  petName: string
  date: string
  time: string
}) {
  const body = `Appointment Rescheduled!\nHi ${data.clientName}! ${data.petName}'s appointment has been moved to ${data.date} at ${data.time}.\nQuestions? Call us at (626) 621-4646\nKokoni Pet Grooming Salon\nReply STOP to opt out.`
  return sendSMS(data.to, body, 'notifyClientRescheduled')
}

// Notify client that pet is ready for pickup
export async function notifyClientGroomingReady(data: {
  to: string
  clientName: string
  petName: string
  customerNote?: string
}) {
  const firstName = data.clientName.split(' ')[0]
  const noteLine = data.customerNote?.trim() ? `\n💌 From your groomer: ${data.customerNote.trim()}` : ''
  const body = `Hi ${firstName}! 🐾 Great news — ${data.petName} will be ready for pickup in 15 minutes! Please pick up within 30 minutes to avoid a late pickup fee.${noteLine}\n📍 https://maps.app.goo.gl/qDTcGhcazqsHvahQ7\nKokoni Pet Grooming Salon — (626) 621-4646\nReply STOP to opt out.`
  return sendSMS(data.to, body, 'notifyClientGroomingReady')
}

// Remind client about tomorrow's appointment
export async function sendAppointmentReminder(data: {
  to: string
  clientName: string
  petName: string
  service: string
  time: string
}) {
  const serviceLabels: Record<string, string> = {
    simply_cute: 'Simply Cute',
    bath_brush: 'Bath & Brush',
    asian_fusion: 'Asian Fusion Style',
  }
  const svcLabel = serviceLabels[data.service] ?? data.service
  const body = `Hi ${data.clientName}! 🐾 Reminder: ${data.petName}'s ${svcLabel} appointment is TOMORROW at ${data.time}.\nKokoni Pet Grooming Salon — (626) 621-4646\nReply STOP to opt out.`
  return sendSMS(data.to, body, 'sendAppointmentReminder')
}
