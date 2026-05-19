'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

// Register service worker for offline / fast-load support
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/kiosk-sw.js', { scope: '/kiosk' }).catch(() => {})
  })
}

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

const IDLE_TIMEOUT = 45_000 // 45 seconds of inactivity → reset to welcome

// ── Venmo / Zelle Waiting Panel (polls for front-desk confirmation) ──────────
function VenmoZelleWaitingPanel({
  appt, method, grandTotal, onConfirmed, onCancel, signaled, onSignaled, pollRef,
}: {
  appt: { id: string; pets?: { name: string } | null; clients?: { name: string } | null; payment_amount?: string | null }
  method: 'venmo' | 'zelle'
  grandTotal: number | null
  onConfirmed: () => void
  onCancel: () => void
  signaled: boolean
  onSignaled: () => void
  pollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
}) {
  useEffect(() => {
    if (!signaled) onSignaled()
    // Poll every 3s for front-desk confirmation
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

  const isVenmo = method === 'venmo'
  return (
    <div className="p-10 flex flex-col items-center gap-7 text-center">
      <div className="text-8xl animate-bounce">{isVenmo ? '💜' : '💛'}</div>
      <div>
        <p className="text-3xl font-black text-gray-800">
          Thanks! The front desk is verifying your {isVenmo ? 'Venmo' : 'Zelle'} payment
        </p>
        <p className="text-xl text-gray-500 mt-2">
          {appt.pets?.name && <span className="font-semibold text-gray-700">{appt.pets.name}</span>}
          {grandTotal ? <span> · <span className={`font-black ${isVenmo ? 'text-indigo-600' : 'text-yellow-600'}`}>${grandTotal.toFixed(2)}</span></span> : null}
        </p>
      </div>
      <div className={`${isVenmo ? 'bg-indigo-50 border-indigo-200' : 'bg-yellow-50 border-yellow-200'} border rounded-2xl px-6 py-4 w-full`}>
        <div className="flex items-center justify-center gap-3">
          <svg className={`animate-spin h-6 w-6 ${isVenmo ? 'text-indigo-500' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className={`font-bold text-lg ${isVenmo ? 'text-indigo-700' : 'text-yellow-700'}`}>Waiting for front desk to confirm…</p>
        </div>
        <p className={`text-sm mt-1 ${isVenmo ? 'text-indigo-500' : 'text-yellow-600'}`}>This will update automatically once verified</p>
      </div>
      <button onClick={onCancel} className="text-gray-400 text-lg font-medium underline mt-2">Cancel</button>
    </div>
  )
}

// ── Cash Waiting Panel (signals cashier, polls for payment) ──────────────────
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
    // Signal cashier once
    if (!signaled) {
      onSignaled()
      fetch('/api/kiosk/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cash-pending', appointmentId: appt.id }),
      }).catch(() => {})
    }
    // Poll every 3s for cashier confirmation
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
    <div className="p-10 flex flex-col items-center gap-7 text-center">
      <div className="text-8xl animate-bounce">💵</div>
      <div>
        <p className="text-3xl font-black text-gray-800">Please hand your cash to the front desk</p>
        <p className="text-xl text-gray-500 mt-2">
          {appt.pets?.name && <span className="font-semibold text-gray-700">{appt.pets.name}</span>}
          {grandTotal ? <span> · <span className="font-black text-green-600">${grandTotal.toFixed(2)}</span></span> : null}
        </p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 w-full">
        <div className="flex items-center justify-center gap-3">
          <svg className="animate-spin h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-green-700 font-bold text-lg">Waiting for cashier to confirm payment…</p>
        </div>
        <p className="text-green-500 text-sm mt-1">This will update automatically once collected</p>
      </div>
      <button onClick={onCancel} className="text-gray-400 text-lg font-medium underline mt-2">Cancel</button>
    </div>
  )
}

export default function KioskPage() {
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
  const [venmoZelleWaiting, setVenmoZelleWaiting] = useState(false)
  const [venmoZelleSignaled, setVenmoZelleSignaled] = useState(false)
  const venmoZellePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }

  // Calculate grand total for payment panels
  const subtotal = appt?.payment_amount ? parseFloat(appt.payment_amount) : null
  const customTipAmt = customTip !== '' ? parseFloat(customTip) : NaN
  const tipAmt = subtotal !== null && tipPercent !== null
    ? (tipPercent === -1 ? (isNaN(customTipAmt) ? 0 : customTipAmt) : subtotal * tipPercent / 100)
    : null
  const grandTotal = subtotal !== null && tipAmt !== null ? subtotal + tipAmt : subtotal

  // ── Idle reset ────────────────────────────────────────────────────────────
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
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(reset, IDLE_TIMEOUT)
    }
    window.addEventListener('pointerdown', refresh)
    window.addEventListener('keydown', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', refresh)
      window.removeEventListener('keydown', refresh)
    }
  }, [step, reset])

  // Auto-advance after success
  useEffect(() => {
    if (step !== 'success') return
    const t = setTimeout(reset, 8_000)
    return () => clearTimeout(t)
  }, [step, reset])

  // ── Square POS callback handler ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)

    // v2.0 Android: ?status=ok&transaction_id=...
    // v1.3 iOS:     ?data=BASE64_JSON
    const statusParam = params.get('status') ?? params.get('com_status')
    const squareData = params.get('data')
    if (!statusParam && !squareData) return

    // Clean the URL immediately
    window.history.replaceState({}, '', '/kiosk')

    const pendingRaw = localStorage.getItem('square_pending_appt')
    if (!pendingRaw) return
    const pending = JSON.parse(pendingRaw)
    localStorage.removeItem('square_pending_appt')

    // Determine success: v2.0 uses status=ok, v1.3 uses decoded JSON
    let isSuccess = false
    try {
      if (statusParam) {
        isSuccess = statusParam === 'ok'
      } else if (squareData) {
        const response = JSON.parse(atob(squareData))
        isSuccess = response.status === 'ok'
      }
    } catch { isSuccess = false }

    if (isSuccess) {
      // Mark checkout in database then show success
      fetch('/api/kiosk/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout',
          appointmentId: pending.apptId,
          paymentMethod: 'card',
          tipAmount: pending.tipAmount ?? null,
        }),
      }).catch(() => {})
      // Flash "Payment Approved" overlay, then go to success screen
      setAppt(pending.appt)
      setMode('checkout')
      setPaymentApproved(true)
      setTimeout(() => {
        setPaymentApproved(false)
        setStep('success')
      }, 2500)
    } else {
      // Payment was cancelled or failed — go back to welcome
      setError('Payment was not completed. Please try again.')
      setStep('welcome')
    }
  }, [])

  // ── Square POS launch ──────────────────────────────────────────────────────
  const buildSquareUrl = (grandTotal: number | null): string | null => {
    try {
      const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID
      if (!appId || !appt) return null
      const amountCents = grandTotal ? Math.round(grandTotal * 100) : 0
      const callbackUrl = `${window.location.origin}/kiosk`
      const isAndroid = /android/i.test(navigator.userAgent)

      if (isAndroid) {
        // Square POS API v2.0 — correct Android intent URL format
        // See: developer.squareup.com/docs/pos-api/build-mobile-web
        const parts = [
          'action=com.squareup.pos.action.CHARGE',
          'package=com.squareup',
          `S.browser_fallback_url=${encodeURIComponent('https://squareup.com/download')}`,
          `S.com.squareup.pos.WEB_CALLBACK_URI=${encodeURIComponent(callbackUrl)}`,
          `S.com.squareup.pos.CLIENT_ID=${encodeURIComponent(appId)}`,
          'S.com.squareup.pos.API_VERSION=v2.0',
          `i.com.squareup.pos.TOTAL_AMOUNT=${amountCents}`,
          'S.com.squareup.pos.CURRENCY_CODE=USD',
          'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD',
          'B.com.squareup.pos.DISABLE_CNP=true',
        ]
        return `intent:#Intent;${parts.join(';')};end`
      } else {
        // iOS: btoa-encoded JSON (ASCII-safe only)
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
            supported_tender_types: ['CREDIT_CARD'],
            skip_receipt_screen: false,
            collect_signature: false,
            disable_cnp: true,
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
      // Compute tip to save alongside appt so Square callback can record it
      const sub = appt.payment_amount ? parseFloat(appt.payment_amount) : null
      const custAmt = customTip !== '' ? parseFloat(customTip) : NaN
      const tip = sub !== null && tipPercent !== null
        ? (tipPercent === -1 ? (isNaN(custAmt) ? 0 : custAmt) : sub * tipPercent / 100)
        : null
      localStorage.setItem('square_pending_appt', JSON.stringify({ apptId: appt.id, appt, tipAmount: tip, timestamp: Date.now() }))
    }
    const url = buildSquareUrl(grandTotal)
    if (url) {
      window.location.href = url
    }
  }

  // ── Numpad input ──────────────────────────────────────────────────────────
  const handleDigit = (d: string) => {
    if (phone.length >= 10) return
    setPhone(p => p + d)
  }
  const handleBackspace = () => setPhone(p => p.slice(0, -1))
  const handleClear = () => setPhone('')

  const formatPhoneDisplay = (raw: string) => {
    if (raw.length <= 3) return raw
    if (raw.length <= 6) return `(${raw.slice(0,3)}) ${raw.slice(3)}`
    return `(${raw.slice(0,3)}) ${raw.slice(3,6)}-${raw.slice(6)}`
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
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
        if (data.appointments.length > 1) {
          // Multiple pets — show selection screen for both check-in and checkout
          setStep('select')
        } else {
          // Single pet — always show 'found' to confirm pet before proceeding
          setStep('found')
        }
      } else {
        setStep('not-found')
      }
    } catch {
      setStep('not-found')
    }
  }

  // ── Action ────────────────────────────────────────────────────────────────
  const confirm = async () => {
    if (!appt) return
    setSubmitting(true)
    // Compute tip for saving
    const subtotal = appt.payment_amount ? parseFloat(appt.payment_amount) : null
    const customTipAmt = customTip !== '' ? parseFloat(customTip) : NaN
    const tipAmt = subtotal !== null && tipPercent !== null
      ? (tipPercent === -1 ? (isNaN(customTipAmt) ? 0 : customTipAmt) : subtotal * tipPercent / 100)
      : null
    try {
      const res = await fetch('/api/kiosk/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, appointmentId: appt.id, paymentMethod, tipAmount: tipAmt }),
      })
      const data = await res.json()
      if (data.success || !data.error) {
        setStep('success')
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Network error — please see the front desk')
    }
    setSubmitting(false)
  }

  // ── Numpad keys ───────────────────────────────────────────────────────────
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  // Accent colors per mode
  const accentBg   = mode === 'checkin' ? 'bg-sky-500'   : 'bg-violet-500'
  const accentText = mode === 'checkin' ? 'text-sky-600'  : 'text-violet-600'
  const accentBorder = mode === 'checkin' ? 'border-sky-400' : 'border-violet-400'
  const accentLight  = mode === 'checkin' ? 'bg-sky-50 border-sky-100 text-sky-700' : 'bg-violet-50 border-violet-100 text-violet-700'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex flex-col items-center justify-center px-10 py-10 select-none overflow-hidden"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 -left-48 w-[600px] h-[600px] bg-sky-100 rounded-full opacity-50 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-[600px] h-[600px] bg-violet-100 rounded-full opacity-50 blur-3xl" />
      </div>

      {/* ── WELCOME ───────────────────────────────────────────────────────── */}
      {step === 'welcome' && (
        <div className="relative flex flex-col items-center gap-14 w-full max-w-2xl text-center">
          {/* Logo */}
          <div className="flex flex-col items-center gap-8">
            <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={320} height={320} className="object-contain" />
            <div>
              <h1 className="text-8xl font-black text-gray-800 leading-tight">Welcome!</h1>
              <p className="text-3xl text-gray-400 mt-3 font-medium">Kokoni Pet Grooming Salon</p>
            </div>
          </div>

          <div className="flex flex-col gap-6 w-full">
            <button
              onClick={() => { setMode('checkin'); setStep('phone') }}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white text-4xl font-black py-12 rounded-3xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-6"
            >
              <span className="text-6xl">🐾</span>
              <span>Check In</span>
              <span className="text-2xl font-semibold text-sky-100 ml-2">I&apos;m dropping off</span>
            </button>
            <button
              onClick={() => { setMode('checkout'); setStep('phone') }}
              className="w-full bg-white border-4 border-gray-200 text-gray-700 text-4xl font-black py-12 rounded-3xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-6 hover:border-violet-300 hover:bg-violet-50"
            >
              <span className="text-6xl">🏠</span>
              <span>Check Out</span>
              <span className="text-2xl font-semibold text-gray-400 ml-2">Picking up my pet</span>
            </button>
          </div>

          <p className="text-gray-400 text-2xl">Tap a button to get started</p>

          {/* Walk In — small quiet button linking to /book */}
          <Link
            href="/book"
            className="text-gray-400 border border-gray-300 bg-white/80 hover:bg-gray-50 text-xl font-semibold px-8 py-3 rounded-2xl shadow-sm flex items-center gap-2 transition-colors active:scale-95"
          >
            🚶 Walk In
          </Link>
        </div>
      )}

      {/* ── PHONE ENTRY ───────────────────────────────────────────────────── */}
      {step === 'phone' && (
        <div className="relative flex flex-col items-center gap-8 w-full max-w-xl">
          {/* Header */}
          <div className="text-center">
            <span className={`inline-block text-xl font-bold px-6 py-2 rounded-full text-white mb-4 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-5xl font-black text-gray-800">Enter your phone number</h2>
          </div>

          {/* Phone display */}
          <div className={`bg-white border-4 ${accentBorder} rounded-3xl px-10 py-7 w-full text-center shadow-sm`}>
            <p className={`text-7xl font-black tracking-widest min-h-[96px] flex items-center justify-center ${phone.length === 0 ? 'text-gray-200' : 'text-gray-800'}`}>
              {phone.length === 0
                ? '_ _ _  _ _ _  _ _ _ _'
                : formatPhoneDisplay(phone)}
            </p>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-4 w-full">
            {KEYS.map((k, i) => (
              k === '' ? (
                <div key={i} />
              ) : k === '⌫' ? (
                <button key={i}
                  onClick={handleBackspace}
                  className="bg-gray-100 border border-gray-200 rounded-2xl py-8 text-5xl font-bold text-gray-500 active:scale-90 active:bg-gray-200 transition-transform"
                >
                  {k}
                </button>
              ) : (
                <button key={i}
                  onClick={() => handleDigit(k)}
                  className="bg-white border border-gray-200 rounded-2xl py-8 text-5xl font-black text-gray-800 shadow-sm active:scale-90 active:bg-gray-50 transition-transform"
                >
                  {k}
                </button>
              )
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4 w-full">
            <button
              onClick={() => { reset() }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-500 font-bold py-7 rounded-2xl text-2xl active:scale-95 transition-transform"
            >
              ← Back
            </button>
            <button
              onClick={lookup}
              disabled={phone.length < 10}
              className={`flex-[2] text-white font-black py-7 rounded-2xl text-3xl shadow-lg disabled:opacity-40 active:scale-95 transition-transform ${accentBg}`}
            >
              Find My Appointment →
            </button>
          </div>
        </div>
      )}

      {/* ── LOADING ───────────────────────────────────────────────────────── */}
      {step === 'loading' && (
        <div className="flex flex-col items-center gap-8 text-center">
          <div className={`w-32 h-32 border-8 border-gray-200 border-t-sky-500 rounded-full animate-spin`} />
          <p className="text-4xl font-bold text-gray-600">Looking up your appointment…</p>
        </div>
      )}

      {/* ── NOT FOUND ─────────────────────────────────────────────────────── */}
      {step === 'not-found' && (
        <div className="relative flex flex-col items-center gap-10 w-full max-w-2xl text-center">
          <div className="bg-white rounded-3xl shadow-xl p-12 w-full">
            <div className="text-9xl mb-6">🔍</div>
            <h2 className="text-5xl font-black text-gray-800 mb-4">No appointment found</h2>
            <p className="text-gray-500 text-2xl">
              We couldn&apos;t find a{mode === 'checkin' ? 'n upcoming' : ' completed'} appointment for<br/>
              <span className="text-gray-800 font-bold text-4xl">{formatPhoneDisplay(phone)}</span><br/>
              today. Please see the front desk for help.
            </p>
          </div>
          <div className="flex gap-4 w-full">
            <button onClick={() => { setPhone(''); setStep('phone') }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-600 font-bold py-7 rounded-2xl text-2xl active:scale-95 transition-transform">
              Try Again
            </button>
            <button onClick={reset}
              className={`flex-1 text-white font-black py-7 rounded-2xl text-2xl shadow-lg active:scale-95 transition-transform ${accentBg}`}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── SELECT PET (multiple pets, both check-in and checkout) ───────── */}
      {step === 'select' && (
        <div className="relative flex flex-col items-center gap-7 w-full max-w-2xl">
          <div className="text-center">
            <span className={`inline-block text-xl font-bold px-6 py-2 rounded-full text-white mb-4 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-5xl font-black text-gray-800">
              {mode === 'checkin' ? 'Which pet are you checking in?' : 'Which pet are you picking up?'}
            </h2>
          </div>

          <div className="flex flex-col gap-4 w-full">
            {appointments.map((a) => (
              <button
                key={a.id}
                onClick={() => { setAppt(a); setStep(mode === 'checkin' ? 'found' : 'payment') }}
                className="bg-white rounded-3xl shadow-md border-2 border-gray-100 hover:border-violet-300 active:scale-95 transition-all overflow-hidden w-full text-left"
              >
                <div className="flex items-center gap-6 px-8 py-6">
                  {a.pets?.photo_url
                    ? <img src={a.pets.photo_url} className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow flex-shrink-0" alt="" />
                    : <div className="w-24 h-24 rounded-2xl bg-violet-100 flex items-center justify-center text-6xl flex-shrink-0">🐶</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-4xl font-black text-gray-800">{a.pets?.name}</p>
                    {a.pets?.breed && <p className="text-gray-500 text-xl">{a.pets.breed}{a.pets.weight ? ` · ${a.pets.weight}` : ''}</p>}
                    <p className="text-violet-600 font-semibold text-xl mt-1">{serviceMap[a.service] ?? a.service} · {a.appointment_time}</p>
                  </div>
                  <span className="text-4xl text-gray-300">›</span>
                </div>
              </button>
            ))}
          </div>

          <button onClick={() => { setStep('phone'); setPhone('') }}
            className="w-full bg-gray-100 border border-gray-200 text-gray-500 font-bold py-7 rounded-2xl text-2xl active:scale-95 transition-transform">
            ← Back
          </button>
        </div>
      )}

      {/* ── APPOINTMENT FOUND ─────────────────────────────────────────────── */}
      {step === 'found' && appt && (
        <div className="relative flex flex-col items-center gap-7 w-full max-w-2xl">
          <div className="text-center">
            <span className={`inline-block text-xl font-bold px-6 py-2 rounded-full text-white mb-4 ${accentBg}`}>
              {mode === 'checkin' ? '🐾 Check In' : '🏠 Check Out'}
            </span>
            <h2 className="text-5xl font-black text-gray-800">
              {mode === 'checkin' ? 'Is this you?' : 'Is this your pet?'}
            </h2>
          </div>

          {/* Appointment card */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full border border-gray-100">
            {/* Pet photo + name header */}
            <div className={`px-8 py-7 flex items-center gap-6 border-b border-gray-100 ${mode === 'checkin' ? 'bg-sky-50' : 'bg-violet-50'}`}>
              {appt.pets?.photo_url
                ? <img src={appt.pets.photo_url} className="w-32 h-32 rounded-2xl object-cover border-4 border-white shadow-md flex-shrink-0" alt="" />
                : <div className={`w-32 h-32 rounded-2xl flex items-center justify-center text-7xl flex-shrink-0 ${mode === 'checkin' ? 'bg-sky-100' : 'bg-violet-100'}`}>🐶</div>}
              <div>
                <p className="text-5xl font-black text-gray-800">{appt.pets?.name}</p>
                {appt.pets?.breed && <p className="text-gray-500 text-xl">{appt.pets.breed}{appt.pets.weight ? ` · ${appt.pets.weight}` : ''}</p>}
                <p className={`font-semibold text-xl mt-1 ${accentText}`}>{appt.clients?.name}</p>
              </div>
            </div>

            {/* Appointment details */}
            <div className="px-8 py-7 flex items-center gap-4">
              <span className="text-4xl">✂️</span>
              <p className="text-3xl font-bold text-gray-800">{serviceMap[appt.service] ?? appt.service}</p>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-xl text-center bg-red-50 border border-red-200 rounded-xl px-6 py-4 w-full">{error}</p>
          )}

          {/* Confirm buttons */}
          <div className="flex gap-4 w-full">
            <button onClick={() => { setStep('phone'); setPhone(''); setTipPercent(null); setCustomTip(''); setPaymentMethod(null) }}
              className="flex-1 bg-gray-100 border border-gray-200 text-gray-500 font-bold py-7 rounded-2xl text-2xl active:scale-95 transition-transform">
              ← Back
            </button>
            {mode === 'checkin' ? (
              <button onClick={confirm} disabled={submitting}
                className={`flex-[2] text-white font-black py-7 rounded-2xl text-3xl shadow-xl disabled:opacity-40 active:scale-95 transition-transform ${accentBg}`}>
                {submitting ? '⏳ Please wait…' : '✓ Check Me In!'}
              </button>
            ) : (
              <button onClick={() => setStep('payment')}
                className={`flex-[2] text-white font-black py-7 rounded-2xl text-3xl shadow-xl active:scale-95 transition-transform ${accentBg}`}>
                Yes, Check Out →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT ───────────────────────────────────────────────────────── */}
      {step === 'payment' && appt && (() => {
        const PAY_METHODS = [
          { key: 'card',  icon: '💳', label: 'Card',  style: 'bg-sky-500 border-sky-500 text-white hover:bg-sky-600' },
          { key: 'cash',  icon: '💵', label: 'Cash',  style: 'bg-green-500 border-green-500 text-white hover:bg-green-600' },
          { key: 'venmo', icon: '💜', label: 'Venmo', style: 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600' },
          { key: 'zelle', icon: '💛', label: 'Zelle', style: 'bg-yellow-400 border-yellow-400 text-white hover:bg-yellow-500' },
        ] as const

        return (
          <div className="relative flex flex-col items-center gap-7 w-full max-w-2xl">
            <div className="text-center">
              <span className="inline-block text-xl font-bold px-6 py-2 rounded-full text-white mb-4 bg-violet-500">
                💳 Payment
              </span>
              <h2 className="text-5xl font-black text-gray-800">How would you like to pay?</h2>
            </div>

            <div className="bg-white rounded-3xl shadow-xl overflow-hidden w-full border border-gray-100 px-8 py-7 space-y-6">

              {/* Subtotal */}
              {subtotal !== null ? (
                <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-6 py-5 border border-gray-100">
                  <span className="text-2xl text-gray-500 font-medium">Subtotal</span>
                  <span className="text-3xl font-bold text-gray-700">${subtotal.toFixed(2)}</span>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-2xl px-6 py-5 border border-amber-100 text-2xl text-amber-700 font-medium text-center">
                  Please see the front desk for your total
                </div>
              )}

              {/* Tip selection — always visible when subtotal is known */}
              {subtotal !== null && (
                <div>
                  <p className="text-xl font-black text-gray-700 mb-1 px-1">🐾 Add a tip for your groomer?</p>
                  <p className="text-xl text-gray-600 font-medium mb-4 px-1">Your groomer works really hard to make your pet look and feel their best — tips are greatly appreciated! 💜</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { pct: 0,  label: 'No Tip' },
                      { pct: 15, label: '15%' },
                      { pct: 20, label: '20%' },
                      { pct: 25, label: '25%' },
                      { pct: -1, label: '✏️ Custom' },
                    ].map(({ pct, label }) => {
                      const tipForBtn = pct > 0 ? subtotal * pct / 100 : 0
                      const totalForBtn = subtotal + tipForBtn
                      const selected = pct === 0 ? tipPercent === 0 : tipPercent === pct
                      return (
                        <button key={pct}
                          onClick={() => {
                            if (selected && pct !== 0) { setTipPercent(null); setCustomTip('') }
                            else { setTipPercent(pct); if (pct !== -1) setCustomTip('') }
                          }}
                          className={`flex flex-col items-center justify-center rounded-2xl py-4 px-2 border-2 transition-all active:scale-95 ${
                            selected ? 'bg-violet-500 border-violet-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600'
                          }`}
                        >
                          <span className="font-black text-xl leading-tight">{label}</span>
                          {pct !== -1 && (
                            <>
                              {pct > 0 && <span className={`text-base mt-0.5 ${selected ? 'text-violet-200' : 'text-gray-400'}`}>tip ${tipForBtn.toFixed(2)}</span>}
                              <span className={`text-lg font-black mt-1 ${selected ? 'text-white' : 'text-gray-700'}`}>= ${totalForBtn.toFixed(2)}</span>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {tipPercent === -1 && (
                    <div className="mt-3 flex items-center gap-3 bg-white border-2 border-violet-400 rounded-2xl px-6 py-4">
                      <span className="text-gray-500 font-bold text-3xl">$</span>
                      <input type="number" inputMode="decimal" min="0" step="0.01"
                        value={customTip} onChange={e => setCustomTip(e.target.value)}
                        placeholder="Enter tip amount"
                        className="flex-1 text-4xl font-bold text-gray-800 outline-none bg-transparent placeholder-gray-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Grand total — always shown prominently so cash/venmo/zelle customers know exact amount */}
              {subtotal !== null && (
                <div className={`flex items-center justify-between rounded-2xl px-6 py-5 border-2 ${
                  tipAmt && tipAmt > 0 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div>
                    <p className={`text-2xl font-semibold ${tipAmt && tipAmt > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                      {tipAmt && tipAmt > 0 ? '💵 Total (incl. tip)' : '💵 Total'}
                    </p>
                    {tipAmt !== null && tipAmt > 0 && (
                      <p className="text-base text-gray-400 mt-0.5">Tip: ${tipAmt.toFixed(2)}</p>
                    )}
                  </div>
                  <span className={`text-5xl font-black ${tipAmt && tipAmt > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                    ${(grandTotal ?? subtotal).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Tap-to-pay buttons — tapping immediately triggers payment */}
              <div>
                <p className="text-base text-gray-400 uppercase tracking-wide font-semibold mb-3 px-1">Tap to pay</p>
                <div className="grid grid-cols-4 gap-3">
                  {PAY_METHODS.map(({ key, icon, label, style }) => (
                    <button key={key}
                      disabled={submitting || (key === 'card' && (!grandTotal || grandTotal <= 0))}
                      title={key === 'card' && (!grandTotal || grandTotal <= 0) ? 'Payment amount not set — please see staff' : undefined}
                      onClick={() => {
                        if (key === 'card' && (!grandTotal || grandTotal <= 0)) return
                        setPaymentMethod(key)
                        if (key === 'card') {
                          handleSquareCardPayment(grandTotal)
                        } else {
                          setQrModal(key as QRModal)
                        }
                      }}
                      className={`flex flex-col items-center justify-center rounded-2xl py-8 px-2 border-2 transition-all active:scale-95 disabled:opacity-40 ${style}`}
                    >
                      <span className="text-5xl leading-tight">{icon}</span>
                      <span className="text-xl font-black mt-2 text-white">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {error && (
              <p className="text-red-600 text-xl text-center bg-red-50 border border-red-200 rounded-2xl px-6 py-4 w-full">{error}</p>
            )}

            <button onClick={() => { setStep('select'); setTipPercent(null); setCustomTip(''); setPaymentMethod(null) }}
              className="w-full bg-gray-100 border border-gray-200 text-gray-500 font-bold py-7 rounded-2xl text-2xl active:scale-95 transition-transform">
              ← Back
            </button>
          </div>
        )
      })()}

      {/* ── QR CODE MODAL (Venmo / Zelle) ─────────────────────────────────── */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-6 py-10"
          onClick={() => setQrModal(null)}
        >
          <div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-8 py-6 flex items-center justify-between ${
              qrModal === 'venmo' ? 'bg-indigo-500' :
              qrModal === 'zelle' ? 'bg-yellow-400' :
              qrModal === 'cash'  ? 'bg-green-500' :
              'bg-sky-500'
            }`}>
              <div className="flex items-center gap-4">
                <span className="text-4xl">{qrModal === 'venmo' ? '💜' : qrModal === 'zelle' ? '💛' : qrModal === 'cash' ? '💵' : '💳'}</span>
                <div>
                  <p className="text-white font-black text-2xl">
                    {qrModal === 'venmo' ? 'Pay with Venmo' : qrModal === 'zelle' ? 'Pay with Zelle' : qrModal === 'cash' ? 'Pay with Cash' : 'Pay with Card'}
                  </p>
                  <p className="text-white/80 text-base font-medium">
                    {qrModal === 'card' ? 'Tap or insert your card' : qrModal === 'cash' ? 'Please pay at the front desk' : 'Scan QR code to send payment'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQrModal(null)}
                className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-black text-2xl active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>

            {/* Card modal */}
            {qrModal === 'card' ? (
              <div className="p-10 flex flex-col items-center gap-8 text-center">
                <div className="text-9xl">💳</div>
                <div>
                  <p className="text-3xl font-black text-gray-800">Pay with Card</p>
                  <p className="text-xl text-gray-500 mt-2">Tap the button below to open Square and pay</p>
                </div>
                {squareUrl && (
                  <button
                    onClick={() => { window.location.href = squareUrl }}
                    className="w-full bg-sky-500 text-white font-black py-6 rounded-2xl text-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-3"
                  >
                    💳 Open Square to Pay
                  </button>
                )}
                <button
                  onClick={() => { setQrModal(null); confirm() }}
                  className="w-full bg-gray-100 border border-gray-200 text-gray-600 font-bold py-5 rounded-2xl text-xl active:scale-95 transition-transform"
                >
                  ✓ Payment Already Done — Check Out
                </button>
                <button onClick={() => setQrModal(null)} className="text-gray-400 text-lg font-medium underline">Cancel</button>
              </div>
            ) : qrModal === 'cash' ? (
              /* Cash modal — signals cashier, polls for confirmation */
              <CashWaitingPanel
                appt={appt!}
                grandTotal={grandTotal}
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
            ) : venmoZelleWaiting ? (
              /* Venmo / Zelle waiting panel — polls for front-desk confirmation */
              <VenmoZelleWaitingPanel
                appt={appt!}
                method={qrModal as 'venmo' | 'zelle'}
                grandTotal={grandTotal}
                onConfirmed={() => { setQrModal(null); setVenmoZelleWaiting(false); setStep('success') }}
                onCancel={() => { setQrModal(null); setVenmoZelleWaiting(false); setVenmoZelleSignaled(false) }}
                signaled={venmoZelleSignaled}
                onSignaled={() => setVenmoZelleSignaled(true)}
                pollRef={venmoZellePollRef}
              />
            ) : (
              /* QR image for Venmo / Zelle */
              <div className="p-8 flex flex-col items-center gap-6">
                {qrModal === 'venmo' ? (
                  <img src="/venmo-wylie.png" alt="Venmo QR Code" className="w-full rounded-2xl object-contain" style={{ maxHeight: '60vh' }} />
                ) : (
                  <img src="/zelle-qr.png" alt="Zelle QR Code" className="w-full rounded-2xl object-contain border border-gray-100" style={{ maxHeight: '60vh' }} />
                )}
                <p className="text-gray-500 text-xl text-center font-medium">
                  Open your {qrModal === 'venmo' ? 'Venmo' : 'Zelle'} app, scan this code, then tap <strong>Done</strong>.
                </p>
                <button
                  disabled={submitting}
                  onClick={async () => {
                    if (!appt) return
                    setSubmitting(true)
                    const subtotal = appt.payment_amount ? parseFloat(appt.payment_amount) : null
                    const customTipAmt = customTip !== '' ? parseFloat(customTip) : NaN
                    const tipAmt = subtotal !== null && tipPercent !== null
                      ? (tipPercent === -1 ? (isNaN(customTipAmt) ? 0 : customTipAmt) : subtotal * tipPercent / 100)
                      : null
                    try {
                      const res = await fetch('/api/kiosk/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'checkout', appointmentId: appt.id, paymentMethod, tipAmount: tipAmt }),
                      })
                      const data = await res.json()
                      if (data.success || !data.error) {
                        setVenmoZelleWaiting(true)
                      } else {
                        setError(data.error || 'Something went wrong')
                      }
                    } catch {
                      setError('Network error — please see the front desk')
                    }
                    setSubmitting(false)
                  }}
                  className={`w-full text-white font-black py-6 rounded-2xl text-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 ${qrModal === 'venmo' ? 'bg-indigo-500' : 'bg-yellow-400'}`}
                >
                  {submitting ? 'Processing…' : '✓ Done — I\'ve Sent Payment'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT APPROVED OVERLAY (Square POS return) ─────────────────── */}
      {paymentApproved && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-green-500">
          <div className="flex flex-col items-center gap-8 text-center px-10">
            <div className="text-[10rem] leading-none">✅</div>
            <h1 className="text-7xl font-black text-white">Payment Approved!</h1>
            <p className="text-3xl text-green-100 font-semibold">Your card was charged successfully.</p>
          </div>
        </div>
      )}

      {/* ── SUCCESS ───────────────────────────────────────────────────────── */}
      {step === 'success' && appt && (
        <div className="relative flex flex-col items-center gap-10 text-center w-full max-w-2xl">
          <div className={`w-52 h-52 rounded-full flex items-center justify-center shadow-2xl ${accentBg}`}>
            <span className="text-9xl animate-bounce">
              {mode === 'checkin' ? '🐾' : '🏠'}
            </span>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-12 w-full border border-gray-100">
            {mode === 'checkin' ? (
              <>
                <h2 className="text-6xl font-black text-gray-800 mb-4">You&apos;re checked in!</h2>
                <p className="text-3xl text-gray-500">
                  <span className="text-gray-800 font-bold">{appt.pets?.name}</span> is all set. 🛁✂️
                </p>
                <p className="text-gray-400 text-2xl mt-4">
                  We&apos;ll send you a text when <span className="font-semibold text-gray-600">{appt.pets?.name}</span> is ready for pickup.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-6xl font-black text-gray-800 mb-4">See you next time!</h2>
                <p className="text-3xl text-gray-500">
                  <span className="text-gray-800 font-bold">{appt.pets?.name}</span> is heading home! 🎉
                </p>
                <p className="text-gray-400 text-2xl mt-4">
                  Thank you for choosing Kokoni Pet Grooming Salon. We hope to see you and {appt.pets?.name} again soon! 🦄
                </p>
                <button
                  onClick={() => {
                    const msg = `${appt.pets?.name ?? 'Your pet'} is going home!`
                    navigator.clipboard.writeText(msg).catch(() => {})
                    const btn = document.getElementById('led-btn')
                    if (btn) { btn.textContent = '✓ Copied! Open coolLED1248 & paste'; (btn as HTMLButtonElement).disabled = true }
                  }}
                  id="led-btn"
                  className="mt-8 w-full py-5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-2xl font-bold rounded-2xl shadow-lg transition-colors"
                >
                  📺 Send to LED Sign
                </button>
              </>
            )}
          </div>

          <p className="text-gray-400 text-2xl">This screen will reset automatically…</p>
        </div>
      )}
    </div>
  )
}
