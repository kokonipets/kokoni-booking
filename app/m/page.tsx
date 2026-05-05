'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type Mode = 'checkin' | 'checkout'
type Step = 'welcome' | 'phone' | 'loading' | 'select' | 'found' | 'payment' | 'not-found' | 'success'
type QRModal = 'venmo' | 'zelle' | 'card' | 'cash' | null

interface KioskAppointment {
  id: string
  appointment_time: string
  service: string
  status: string
  payment_amount: string | null
  payment_method: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  clients: { name: string; phone: string; email: string | null } | null
  pets: { id: string; name: string; breed: string | null; weight: string | null; photo_url: string | null } | null
}

const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}

const IDLE_TIMEOUT = 60_000 // 60 seconds for mobile

// ── Cash Waiting Panel ──────────────────────────────────────────────────────
function CashWaitingPanel({
  appt, grandTotal, onConfirmed, onCancel, signaled, onSignaled, pollRef,
}: {
  appt: { id: string; pets?: { name: string } | null; clients?: { name: string } | null; payment_amount?: string | null }
  grandTotal: number | null
  onConfirmed: () => void
  onCancel: () => void
  signaled: boolean
  onSignaled: () => void
  pollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
}) {
  useEffect(() => {
    if (!signaled) {
      onSignaled()
      fetch('/api/kiosk/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cash-pending', appointmentId: appt.id }),
      }).catch(() => {})
    }
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/kiosk/appointment-status?id=${appt.id}&t=${Date.now()}`)
        const data = await res.json()
        if (data.payment_status === 'paid') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          onConfirmed()
        }
      } catch {/**/}
    }, 3000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-5 flex flex-col items-center gap-4 text-center">
      <div className="text-5xl animate-bounce">💵</div>
      <div>
        <p className="text-lg font-black text-gray-800">Please hand your cash to the front desk</p>
        <p className="text-sm text-gray-500 mt-1">
          {appt.pets?.name && <span className="font-semibold text-gray-700">{appt.pets.name}</span>}
          {grandTotal ? <span> · <span className="font-black text-green-600">${grandTotal.toFixed(2)}</span></span> : null}
        </p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 w-full">
        <div className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-green-700 font-bold text-sm">Waiting for cashier…</p>
        </div>
      </div>
      <button onClick={onCancel} className="text-gray-400 text-sm font-medium underline mt-1">Cancel</button>
    </div>
  )
}

export default function MobileKioskPage() {
  const [mode, setMode] = useState<Mode>('checkin')
  const [step, setStep] = useState<Step>('welcome')
  const [phone, setPhone] = useState('')
  const [appt, setAppt] = useState<KioskAppointment | null>(null)
  const [appointments, setAppointments] = useState<KioskAppointment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tipPercent, setTipPercent] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'venmo' | 'zelle' | null>(null)
  const [qrModal, setQrModal] = useState<QRModal>(null)
  const [paymentApproved, setPaymentApproved] = useState(false)
  const [squareUrl, setSquareUrl] = useState<string | null>(null)
  const [cashPendingSignaled, setCashPendingSignaled] = useState(false)
  const cashPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }

  // ── Idle reset ──────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep('welcome')
    setPhone('')
    setAppt(null)
    setAppointments([])
    setError('')
    setSubmitting(false)
    setTipPercent(null)
    setCustomTip('')
    setPaymentMethod(null)
    setQrModal(null)
    setPaymentApproved(false)
    setCashPendingSignaled(false)
    if (cashPollRef.current) { clearInterval(cashPollRef.current); cashPollRef.current = null }
  }, [])

  // Load service names from settings on mount
  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { const all = JSON.parse(svcVal); setServiceDefs(all.filter((s: { visible?: unknown }) => s.visible !== false && s.visible !== 'false' && s.visible !== 0)) } catch { /**/ } }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (step === 'welcome') return
    let timer = setTimeout(reset, IDLE_TIMEOUT)
    const refresh = () => { clearTimeout(timer); timer = setTimeout(reset, IDLE_TIMEOUT) }
    window.addEventListener('pointerdown', refresh)
    window.addEventListener('keydown', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', refresh); window.removeEventListener('keydown', refresh) }
  }, [step, reset])

  useEffect(() => {
    if (step !== 'success') return
    const t = setTimeout(reset, 8_000)
    return () => clearTimeout(t)
  }, [step, reset])

  // ── Square POS callback handler ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const statusParam = params.get('status') ?? params.get('com_status')
    const squareData = params.get('data')
    if (!statusParam && !squareData) return
    window.history.replaceState({}, '', '/m')
    const pendingRaw = localStorage.getItem('square_pending_appt')
    if (!pendingRaw) return
    const pending = JSON.parse(pendingRaw)
    localStorage.removeItem('square_pending_appt')
    let isSuccess = false
    try {
      if (statusParam) { isSuccess = statusParam === 'ok' }
      else if (squareData) { const response = JSON.parse(atob(squareData)); isSuccess = response.status === 'ok' }
    } catch { isSuccess = false }
    if (isSuccess) {
      fetch('/api/kiosk/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', appointmentId: pending.apptId, paymentMethod: 'card' }),
      }).catch(() => {})
      setAppt(pending.appt)
      setMode('checkout')
      setPaymentApproved(true)
      setTimeout(() => { setPaymentApproved(false); setStep('success') }, 2500)
    } else {
      setError('Payment was not completed. Please try again.')
      setStep('welcome')
    }
  }, [])

  // ── Square POS launch ────────────────────────────────────────────────────
  const buildSquareUrl = (grandTotal: number | null): string | null => {
    try {
      const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID
      if (!appId || !appt) return null
      const amountCents = grandTotal ? Math.round(grandTotal * 100) : 0
      const callbackUrl = `${window.location.origin}/m`
      const isAndroid = /android/i.test(navigator.userAgent)
      if (isAndroid) {
        const parts = [
          'action=com.squareup.pos.action.CHARGE',
          'package=com.squareup',
          `S.browser_fallback_url=${encodeURIComponent('https://squareup.com/download')}`,
          `S.com.squareup.pos.WEB_CALLBACK_URI=${encodeURIComponent(callbackUrl)}`,
          `S.com.squareup.pos.CLIENT_ID=${encodeURIComponent(appId)}`,
          'S.com.squareup.pos.API_VERSION=v2.0',
          `i.com.squareup.pos.TOTAL_AMOUNT=${amountCents}`,
          'S.com.squareup.pos.CURRENCY_CODE=USD',
          'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD,com.squareup.pos.TENDER_SQUARE_GIFT_CARD',
        ]
        return `intent:#Intent;${parts.join(';')};end`
      } else {
        const petName = (appt.pets?.name ?? 'Pet').replace(/[^\x00-\x7F]/g, '')
        const svcLabel = (serviceMap[appt.service] ?? appt.service).replace(/[^\x00-\x7F]/g, '')
        const data = {
          amount_money: { amount: amountCents, currency_code: 'USD' },
          callback_url: callbackUrl,
          client_id: appId,
          version: '1.3',
          transaction_id: String(appt.id),
          notes: `Grooming - ${petName} (${svcLabel})`,
          options: {
            supported_tender_types: ['CREDIT_CARD', 'SQUARE_GIFT_CARD'],
            skip_receipt_screen: false,
            collect_signature: false,
          },
        }
        const encoded = btoa(JSON.stringify(data))
        return `square-commerce-v1://payment/create?data=${encodeURIComponent(encoded)}`
      }
    } catch (e) {
      console.error('buildSquareUrl error:', e)
      return null
    }
  }

  const handleSquareCardPayment = (grandTotal: number | null) => {
    if (appt) {
      localStorage.setItem('square_pending_appt', JSON.stringify({ apptId: appt.id, appt, timestamp: Date.now() }))
    }
    const url = buildSquareUrl(grandTotal)
    if (url) window.location.href = url
  }

  // ── Numpad input ────────────────────────────────────────────────────────
  const handleDigit = (d: string) => { if (phone.length >= 10) return; setPhone(p => p + d) }
  const handleBackspace = () => setPhone(p => p.slice(0, -1))

  const formatPhoneDisplay = (raw: string) => {
    if (raw.length <= 3) return raw
    if (raw.length <= 6) return `(${raw.slice(0,3)}) ${raw.slice(3)}`
    return `(${raw.slice(0,3)}) ${raw.slice(3,6)}-${raw.slice(6)}`
  }

  // ── Lookup ──────────────────────────────────────────────────────────────
  const lookup = async () => {
    if (phone.length < 10) return
    setStep('loading')
    setError('')
    try {
      const res = await fetch(`/api/kiosk/lookup?phone=${phone}&mode=${mode}`)
      const data = await res.json()
      if (data.appointments && data.appointments.length > 0) {
        setAppointments(data.appointments)
        setAppt(data.appointments[0])
        if (data.appointments.length > 1) setStep('select')
        else setStep('found')
      } else {
        setStep('not-found')
      }
    } catch { setStep('not-found') }
  }

  // ── Action ──────────────────────────────────────────────────────────────
  const confirm = async () => {
    if (!appt) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/kiosk/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, appointmentId: appt.id, paymentMethod }),
      })
      const data = await res.json()
      if (data.success || !data.error) setStep('success')
      else setError(data.error || 'Something went wrong')
    } catch { setError('Network error — please see the front desk') }
    setSubmitting(false)
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const accentBg = mode === 'checkin' ? 'bg-sky-500' : 'bg-violet-500'
  const accentText = mode === 'checkin' ? 'text-sky-600' : 'text-violet-600'
  const accentBorder = mode === 'checkin' ? 'border-sky-400' : 'border-violet-400'

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen min-h-dvh bg-gradient-to-br from-slate-50 via-white to-sky-50 flex flex-col items-center justify-center px-4 py-6 select-none overflow-hidden"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Decorative blobs — smaller for mobile */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[300px] h-[300px] bg-sky-100 rounded-full opacity-40 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[300px] h-[300px] bg-violet-100 rounded-full opacity-40 blur-3xl" />
      </div>

      {/* ── WELCOME ───────────────────────────────────────────────────────── */}
      {step === 'welcome' && (
        <div className="relative flex flex-col items-center gap-6 w-full max-w-sm text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-2xl shadow-lg p-4 ring-1 ring-gray-100">
              <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={100} height={100} className="rounded-xl" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-800 leading-tight">Welcome!</h1>
              <p className="text-sm text-gray-400 mt-1 font-medium">Kokoni Pet Grooming Salon</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => { setMode('checkin'); setStep('phone') }}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white text-lg font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <span className="text-2xl">🐾</span>
              <span>Check In</span>
              <span className="text-xs font-semibold text-sky-100 ml-1">Dropping off</span>
            </button>
            <button
              onClick={() => { setMode('checkout'); setStep('phone') }}
              className="w-full bg-white border-2 border-gray-200 text-gray-700 text-lg font-black py-5 rounded-2xl shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3 hover:border-violet-300 hover:bg-violet-50"
            >
              <span className="text-2xl">🏠</span>
              <span>Check Out</span>
              <span className="text-xs font-semibold text-gray-400 ml-1">Picking up</span>
            </button>
          </div>

          <p className="text-gray-400 text-xs">Tap a button to get started</p>

          <Link
            href="/book"
            className="text-gray-400 border border-gray-300 bg-white/80 hover:bg-gray-50 text-sm font-semibold px-5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors active:scale-95"
          >
            🚶 Walk In
          </Link>
        </div>
      )}

      {/* ── PHONE ENTRY ─────────────────────────────────────────────────── */}
      {step === 'phone' && (
        <div className="relative flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="text-center">
            <span className={`inline-block text-xs font-bold px-4 py-1.5 rounded-full text-white mb-2 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-xl font-black text-gray-800">Enter your phone number</h2>
          </div>

          <div className={`bg-white border-2 ${accentBorder} rounded-2xl px-4 py-3 w-full text-center shadow-sm`}>
            <p className={`text-2xl font-black tracking-wider min-h-[36px] flex items-center justify-center ${phone.length === 0 ? 'text-gray-200' : 'text-gray-800'}`}>
              {phone.length === 0
                ? '(___) ___-____'
                : formatPhoneDisplay(phone)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full">
            {KEYS.map((k, i) => (
              k === '' ? (
                <div key={i} />
              ) : k === '⌫' ? (
                <button key={i}
                  onClick={handleBackspace}
                  className="bg-gray-100 border border-gray-200 rounded-xl py-3.5 text-xl font-bold text-gray-500 active:scale-90 active:bg-gray-200 transition-transform"
                >
                  {k}
                </button>
              ) : (
                <button key={i}
                  onClick={() => handleDigit(k)}
                  className="bg-white border border-gray-200 rounded-xl py-3.5 text-xl font-black text-gray-800 shadow-sm active:scale-90 active:bg-gray-50 transition-transform"
                >
                  {k}
                </button>
              )
            ))}
          </div>

          <div className="flex gap-2 w-full">
            <button
              onClick={() => { reset() }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform"
            >
              ← Back
            </button>
            <button
              onClick={lookup}
              disabled={phone.length < 10}
              className={`flex-[2] text-white font-black py-3 rounded-xl text-base shadow-md disabled:opacity-40 active:scale-95 transition-transform ${accentBg}`}
            >
              Find Appointment →
            </button>
          </div>
        </div>
      )}

      {/* ── LOADING ─────────────────────────────────────────────────────── */}
      {step === 'loading' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-lg font-bold text-gray-600">Looking up your appointment…</p>
        </div>
      )}

      {/* ── NOT FOUND ───────────────────────────────────────────────────── */}
      {step === 'not-found' && (
        <div className="relative flex flex-col items-center gap-5 w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 w-full">
            <div className="text-5xl mb-3">🔍</div>
            <h2 className="text-xl font-black text-gray-800 mb-2">No appointment found</h2>
            <p className="text-gray-500 text-sm">
              We couldn&apos;t find a{mode === 'checkin' ? 'n upcoming' : ' completed'} appointment for{' '}
              <span className="text-gray-800 font-bold">{formatPhoneDisplay(phone)}</span>{' '}
              today. Please see the front desk.
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={() => { setPhone(''); setStep('phone') }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform">
              Try Again
            </button>
            <button onClick={reset}
              className={`flex-1 text-white font-black py-3 rounded-xl text-sm shadow-md active:scale-95 transition-transform ${accentBg}`}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── SELECT PET ──────────────────────────────────────────────────── */}
      {step === 'select' && (
        <div className="relative flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="text-center">
            <span className={`inline-block text-xs font-bold px-4 py-1.5 rounded-full text-white mb-2 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-xl font-black text-gray-800">
              {mode === 'checkin' ? 'Which pet?' : 'Which pet are you picking up?'}
            </h2>
          </div>

          <div className="flex flex-col gap-2.5 w-full">
            {appointments.map((a) => (
              <button
                key={a.id}
                onClick={() => { setAppt(a); setStep(mode === 'checkin' ? 'found' : 'payment') }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-violet-300 active:scale-95 transition-all overflow-hidden w-full text-left"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {a.pets?.photo_url
                    ? <img src={a.pets.photo_url} className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow flex-shrink-0" alt="" />
                    : <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center text-2xl flex-shrink-0">🐶</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-black text-gray-800">{a.pets?.name}</p>
                    {a.pets?.breed && <p className="text-gray-500 text-xs">{a.pets.breed}{a.pets.weight ? ` · ${a.pets.weight}` : ''}</p>}
                    <p className="text-violet-600 font-semibold text-xs mt-0.5">{serviceMap[a.service] ?? a.service} · {a.appointment_time}</p>
                  </div>
                  <span className="text-lg text-gray-300">›</span>
                </div>
              </button>
            ))}
          </div>

          <button onClick={() => { setStep('phone'); setPhone('') }}
            className="w-full bg-gray-100 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform">
            ← Back
          </button>
        </div>
      )}

      {/* ── APPOINTMENT FOUND ───────────────────────────────────────────── */}
      {step === 'found' && appt && (
        <div className="relative flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="text-center">
            <span className={`inline-block text-xs font-bold px-4 py-1.5 rounded-full text-white mb-2 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-xl font-black text-gray-800">
              {mode === 'checkin' ? 'Is this you?' : 'Is this your pet?'}
            </h2>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden w-full border border-gray-100">
            <div className={`px-4 py-4 flex items-center gap-3 border-b border-gray-100 ${mode === 'checkin' ? 'bg-sky-50' : 'bg-violet-50'}`}>
              {appt.pets?.photo_url
                ? <img src={appt.pets.photo_url} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow flex-shrink-0" alt="" />
                : <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl flex-shrink-0 ${mode === 'checkin' ? 'bg-sky-100' : 'bg-violet-100'}`}>🐶</div>}
              <div>
                <p className="text-xl font-black text-gray-800">{appt.pets?.name}</p>
                {appt.pets?.breed && <p className="text-gray-500 text-xs">{appt.pets.breed}{appt.pets.weight ? ` · ${appt.pets.weight}` : ''}</p>}
                <p className={`font-semibold text-xs mt-0.5 ${accentText}`}>{appt.clients?.name}</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="text-lg">✂️</span>
              <p className="text-base font-bold text-gray-800">{serviceMap[appt.service] ?? appt.service}</p>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center bg-red-50 border border-red-200 rounded-lg px-4 py-2 w-full">{error}</p>
          )}

          <div className="flex gap-2 w-full">
            <button onClick={() => { setStep('phone'); setPhone(''); setTipPercent(null); setCustomTip(''); setPaymentMethod(null) }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform">
              ← Back
            </button>
            {mode === 'checkin' ? (
              <button onClick={confirm} disabled={submitting}
                className={`flex-[2] text-white font-black py-3 rounded-xl text-base shadow-lg disabled:opacity-40 active:scale-95 transition-transform ${accentBg}`}>
                {submitting ? '⏳ Please wait…' : '✓ Check Me In!'}
              </button>
            ) : (
              <button onClick={() => setStep('payment')}
                className={`flex-[2] text-white font-black py-3 rounded-xl text-base shadow-lg active:scale-95 transition-transform ${accentBg}`}>
                Yes, Check Out →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT ─────────────────────────────────────────────────────── */}
      {step === 'payment' && appt && (() => {
        const subtotal = appt.payment_amount ? parseFloat(appt.payment_amount) : null
        const customTipAmt = customTip !== '' ? parseFloat(customTip) : NaN
        const tipAmt = subtotal !== null && tipPercent !== null
          ? (tipPercent === -1 ? (isNaN(customTipAmt) ? 0 : customTipAmt) : subtotal * tipPercent / 100)
          : null
        const grandTotal = subtotal !== null && tipAmt !== null ? subtotal + tipAmt : subtotal

        const PAY_METHODS = [
          { key: 'card',  icon: '💳', label: 'Card',  style: 'bg-sky-500 border-sky-500 text-white hover:bg-sky-600' },
          { key: 'cash',  icon: '💵', label: 'Cash',  style: 'bg-green-500 border-green-500 text-white hover:bg-green-600' },
          { key: 'venmo', icon: '💜', label: 'Venmo', style: 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600' },
          { key: 'zelle', icon: '💛', label: 'Zelle', style: 'bg-yellow-400 border-yellow-400 text-white hover:bg-yellow-500' },
        ] as const

        return (
          <div className="relative flex flex-col items-center gap-4 w-full max-w-sm">
            <div className="text-center">
              <span className="inline-block text-xs font-bold px-4 py-1.5 rounded-full text-white mb-2 bg-violet-500">
                💳 Payment
              </span>
              <h2 className="text-xl font-black text-gray-800">How would you like to pay?</h2>
            </div>

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden w-full border border-gray-100 px-4 py-4 space-y-4">

              {/* Subtotal */}
              {subtotal !== null ? (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <span className="text-sm text-gray-500 font-medium">Subtotal</span>
                  <span className="text-lg font-bold text-gray-700">${subtotal.toFixed(2)}</span>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100 text-sm text-amber-700 font-medium text-center">
                  See front desk for your total
                </div>
              )}

              {/* Tip selection */}
              {subtotal !== null && (
                <div>
                  <p className="text-sm font-black text-gray-700 mb-1">🐾 Add a tip?</p>
                  <p className="text-xs text-gray-500 font-medium mb-3">Your groomer works hard to make your pet look their best — tips are appreciated! 💜</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { pct: 15, label: '15%' },
                      { pct: 20, label: '20%' },
                      { pct: 25, label: '25%' },
                      { pct: -1, label: '✏️' },
                    ].map(({ pct, label }) => {
                      const amt = pct > 0 ? subtotal * pct / 100 : null
                      const selected = tipPercent === pct
                      return (
                        <button key={pct}
                          onClick={() => {
                            if (selected) { setTipPercent(null); setCustomTip('') }
                            else { setTipPercent(pct); if (pct !== -1) setCustomTip('') }
                          }}
                          className={`flex flex-col items-center justify-center rounded-xl py-3 px-1 border-2 transition-all active:scale-95 ${
                            selected ? 'bg-violet-500 border-violet-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600'
                          }`}
                        >
                          <span className="font-black text-sm leading-tight">{label}</span>
                          {amt !== null && (
                            <span className={`text-xs mt-0.5 ${selected ? 'text-violet-100' : 'text-gray-400'}`}>${amt.toFixed(2)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {tipPercent === -1 && (
                    <div className="mt-2 flex items-center gap-2 bg-white border-2 border-violet-400 rounded-xl px-4 py-2.5">
                      <span className="text-gray-500 font-bold text-lg">$</span>
                      <input type="number" inputMode="decimal" min="0" step="0.01"
                        value={customTip} onChange={e => setCustomTip(e.target.value)}
                        placeholder="Enter tip"
                        className="flex-1 text-lg font-bold text-gray-800 outline-none bg-transparent placeholder-gray-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Grand total */}
              {grandTotal !== null && tipAmt !== null && tipAmt > 0 && (
                <div className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-3 border-2 border-green-200">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💵</span>
                    <span className="text-sm font-semibold text-green-700">Total</span>
                  </div>
                  <span className="text-xl font-black text-green-700">${grandTotal!.toFixed(2)}</span>
                </div>
              )}

              {/* Pay buttons */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Tap to pay</p>
                <div className="grid grid-cols-4 gap-2">
                  {PAY_METHODS.map(({ key, icon, label, style }) => (
                    <button key={key}
                      disabled={submitting}
                      onClick={() => {
                        setPaymentMethod(key)
                        if (key === 'card') handleSquareCardPayment(grandTotal)
                        else setQrModal(key as QRModal)
                      }}
                      className={`flex flex-col items-center justify-center rounded-xl py-4 px-1 border-2 transition-all active:scale-95 disabled:opacity-40 ${style}`}
                    >
                      <span className="text-2xl leading-tight">{icon}</span>
                      <span className="text-xs font-black mt-1 text-white">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm text-center bg-red-50 border border-red-200 rounded-lg px-4 py-2 w-full">{error}</p>
            )}

            <button onClick={() => { setStep('select'); setTipPercent(null); setCustomTip(''); setPaymentMethod(null) }}
              className="w-full bg-gray-100 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform">
              ← Back
            </button>
          </div>
        )
      })()}

      {/* ── QR CODE MODAL ───────────────────────────────────────────────── */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6"
          onClick={() => setQrModal(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className={`px-5 py-4 flex items-center justify-between ${
              qrModal === 'venmo' ? 'bg-indigo-500' :
              qrModal === 'zelle' ? 'bg-yellow-400' :
              qrModal === 'cash'  ? 'bg-green-500' : 'bg-sky-500'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{qrModal === 'venmo' ? '💜' : qrModal === 'zelle' ? '💛' : qrModal === 'cash' ? '💵' : '💳'}</span>
                <div>
                  <p className="text-white font-black text-base">
                    {qrModal === 'venmo' ? 'Pay with Venmo' : qrModal === 'zelle' ? 'Pay with Zelle' : qrModal === 'cash' ? 'Pay with Cash' : 'Pay with Card'}
                  </p>
                  <p className="text-white/80 text-xs font-medium">
                    {qrModal === 'card' ? 'Tap or insert your card' : qrModal === 'cash' ? 'Pay at front desk' : 'Scan QR code'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQrModal(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-black text-sm active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>

            {qrModal === 'card' ? (
              <div className="p-5 flex flex-col items-center gap-4 text-center">
                <div className="text-5xl">💳</div>
                <div>
                  <p className="text-lg font-black text-gray-800">Pay with Card</p>
                  <p className="text-sm text-gray-500 mt-1">Tap below to open Square</p>
                </div>
                {squareUrl && (
                  <button
                    onClick={() => { window.location.href = squareUrl }}
                    className="w-full bg-sky-500 text-white font-black py-3 rounded-xl text-sm shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    💳 Open Square to Pay
                  </button>
                )}
                <button
                  onClick={() => { setQrModal(null); confirm() }}
                  className="w-full bg-gray-100 border border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform"
                >
                  ✓ Already Paid — Check Out
                </button>
                <button onClick={() => setQrModal(null)} className="text-gray-400 text-xs font-medium underline">Cancel</button>
              </div>
            ) : qrModal === 'cash' ? (
              <CashWaitingPanel
                appt={appt!}
                grandTotal={(() => {
                  const subtotal = appt!.payment_amount ? parseFloat(appt!.payment_amount) : null
                  const customTipAmt = customTip !== '' ? parseFloat(customTip) : NaN
                  const tipAmt = subtotal !== null && tipPercent !== null
                    ? (tipPercent === -1 ? (isNaN(customTipAmt) ? 0 : customTipAmt) : subtotal * tipPercent / 100)
                    : null
                  return subtotal !== null && tipAmt !== null ? subtotal + tipAmt : subtotal
                })()}
                onConfirmed={() => { setQrModal(null); confirm() }}
                onCancel={() => {
                  setQrModal(null)
                  setCashPendingSignaled(false)
                  if (cashPollRef.current) { clearInterval(cashPollRef.current); cashPollRef.current = null }
                }}
                signaled={cashPendingSignaled}
                onSignaled={() => setCashPendingSignaled(true)}
                pollRef={cashPollRef}
              />
            ) : (
              <div className="p-5 flex flex-col items-center gap-4">
                {qrModal === 'venmo' ? (
                  <img src="/venmo-wylie.png" alt="Venmo QR Code" className="w-full rounded-xl object-contain" style={{ maxHeight: '50vh' }} />
                ) : (
                  <img src="/zelle-qr.png" alt="Zelle QR Code" className="w-full rounded-xl object-contain border border-gray-100" style={{ maxHeight: '50vh' }} />
                )}
                <p className="text-gray-500 text-sm text-center font-medium">
                  Open {qrModal === 'venmo' ? 'Venmo' : 'Zelle'}, scan this code, then tap <strong>Done</strong>.
                </p>
                <button
                  onClick={() => { setQrModal(null); confirm() }}
                  className={`w-full text-white font-black py-3 rounded-xl text-sm shadow-md active:scale-95 transition-transform ${qrModal === 'venmo' ? 'bg-indigo-500' : 'bg-yellow-400'}`}
                >
                  ✓ Done — I&apos;ve Paid
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT APPROVED OVERLAY ────────────────────────────────────── */}
      {paymentApproved && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-green-500">
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="text-6xl leading-none">✅</div>
            <h1 className="text-3xl font-black text-white">Payment Approved!</h1>
            <p className="text-base text-green-100 font-semibold">Card charged successfully.</p>
          </div>
        </div>
      )}

      {/* ── SUCCESS ─────────────────────────────────────────────────────── */}
      {step === 'success' && appt && (
        <div className="relative flex flex-col items-center gap-5 text-center w-full max-w-sm">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl ${accentBg}`}>
            <span className="text-5xl animate-bounce">
              {mode === 'checkin' ? '🐾' : '🏠'}
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 w-full border border-gray-100">
            {mode === 'checkin' ? (
              <>
                <h2 className="text-2xl font-black text-gray-800 mb-2">You&apos;re checked in!</h2>
                <p className="text-base text-gray-500">
                  <span className="text-gray-800 font-bold">{appt.pets?.name}</span> is all set. 🛁✂️
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  We&apos;ll text you when <span className="font-semibold text-gray-600">{appt.pets?.name}</span> is ready.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-gray-800 mb-2">See you next time!</h2>
                <p className="text-base text-gray-500">
                  <span className="text-gray-800 font-bold">{appt.pets?.name}</span> is heading home! 🎉
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Thank you for choosing Kokoni Pet Grooming Salon! 🦄
                </p>
              </>
            )}
          </div>

          <p className="text-gray-400 text-xs">This screen will reset automatically…</p>
        </div>
      )}
    </div>
  )
}
