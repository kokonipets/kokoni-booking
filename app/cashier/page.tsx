'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SERVICE_LABELS: Record<string, string> = {
  bath_brush: 'Bath & Brush', bath_haircut: 'Bath & Haircut', full_groom: 'Full Groom',
  asian_fusion: 'Asian Fusion Style', nail_trim: 'Nail Trim', teeth_brushing: 'Teeth Brushing',
  ear_cleaning: 'Ear Cleaning', deshedding: 'De-shedding', flea_treatment: 'Flea Treatment',
  puppy_first: 'Puppy First Groom', simply_cute: 'Simply Cute',
}

const PM = {
  card:  { bg: 'bg-sky-100',    text: 'text-sky-700',    icon: '💳', label: 'Card',  border: 'border-sky-200',  tip: 'Card tip is collected digitally' },
  cash:  { bg: 'bg-green-100',  text: 'text-green-700',  icon: '💵', label: 'Cash',  border: 'border-green-200', tip: 'Enter cash tip amount' },
  venmo: { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: '💙', label: 'Venmo', border: 'border-blue-200',  tip: 'Enter Venmo tip amount' },
  zelle: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '💛', label: 'Zelle', border: 'border-yellow-200', tip: 'Enter Zelle tip amount' },
} as Record<string, { bg: string; text: string; icon: string; label: string; border: string; tip: string }>

type Appt = {
  id: string
  appointment_time: string
  appointment_date: string
  service: string
  status: string
  grooming_status: string | null
  payment_method: string | null
  payment_amount: string | null
  tip_amount: string | null
  payment_status: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  pets: { id: string; name: string; breed?: string; photo_url: string | null } | null
  clients: { name: string; phone: string } | null
}

type Tab = 'dashboard' | 'checkin' | 'checkout'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt12(t: string | null | undefined) {
  if (!t) return '—'
  if (/am|pm/i.test(t)) return t.trim()
  const p = t.split(':').map(Number)
  const h = p[0], m = isNaN(p[1]) ? 0 : p[1]
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtMoney(v: string | null | number | undefined) {
  const n = parseFloat(String(v ?? '0'))
  return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`
}
function firstName(name: string) {
  return name?.split(' ')[0] ?? name
}
function normalizePhone(p?: string | null) {
  return (p || '').replace(/\D/g, '')
}
// Split a total tip across appointments proportionally by each one's service amount.
// Cents are rounded per item and any rounding remainder is added to the first item
// so the parts always sum exactly to the requested total.
function splitTip(serviceAmts: number[], totalTip: number): number[] {
  const sum = serviceAmts.reduce((s, v) => s + v, 0)
  if (totalTip <= 0 || sum <= 0) return serviceAmts.map(() => 0)
  const parts = serviceAmts.map(v => Math.round((totalTip * v / sum) * 100) / 100)
  const diff = Math.round((totalTip - parts.reduce((s, v) => s + v, 0)) * 100) / 100
  if (parts.length) parts[0] = Math.round((parts[0] + diff) * 100) / 100
  return parts
}

// ── Checkout Modal ────────────────────────────────────────────────────────────
function CheckoutModal({
  appt,
  onClose,
  onSuccess,
  serviceLabels,
}: {
  appt: Appt
  onClose: () => void
  onSuccess: (updated: Partial<Appt>) => void
  serviceLabels?: Record<string, string>
}) {
  const [method, setMethod] = useState<'card' | 'cash' | 'venmo' | 'zelle'>(
    (appt.payment_method as 'card' | 'cash' | 'venmo' | 'zelle') || 'card'
  )
  const [amount, setAmount] = useState(appt.payment_amount || '')
  const [tip, setTip] = useState(appt.tip_amount && appt.tip_amount !== '0' ? appt.tip_amount : '')
  const [discount, setDiscount] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const petId = appt.pets?.id
    if (!petId) { setIsFirstTime(false); return }
    fetch(`/api/groomer/last-payment?pet_id=${petId}&exclude_id=${appt.id}`)
      .then(r => r.json())
      .then(d => setIsFirstTime(!d.amount))
      .catch(() => setIsFirstTime(false))
  }, [appt.id, appt.pets?.id])
  const [done, setDone] = useState(false)

  const rawAmt = parseFloat(amount) || 0
  const discountAmt = discount ? Math.round(rawAmt * 0.20 * 100) / 100 : 0
  const serviceAmt = rawAmt - discountAmt
  const tipAmt = parseFloat(tip) || 0
  const total = serviceAmt + tipAmt

  // Quick tip % for card; manual for others
  const cardTipPcts = [15, 18, 20, 25]
  const setTipPct = (pct: number) => setTip((serviceAmt * pct / 100).toFixed(2))


  const confirm = async () => {
    if (!amount) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record-payment',
          payment_amount: serviceAmt.toFixed(2),
          tip_amount: tip || '0',
          payment_method: method,
          payment_status: 'paid',
          discount_label: discount ? 'First-time customer 20% off' : null,
          discount_percent: discount ? '20' : null,
          discount_amount: discount ? discountAmt.toFixed(2) : null,
        }),
      })
      const d = await res.json()
      if (d.success) {
        setDone(true)
        onSuccess({
          payment_amount: serviceAmt.toFixed(2),
          tip_amount: tip || '0',
          payment_method: method,
          payment_status: 'paid',
        })
        setTimeout(onClose, 1200)
      }
    } catch {/**/}
    setSaving(false)
  }

  const pm = PM[method]

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative bg-white rounded-3xl p-10 text-center shadow-2xl">
          <p className="text-6xl mb-3">✅</p>
          <p className="text-2xl font-black text-gray-800">Payment Recorded!</p>
          <p className="text-gray-400 mt-1">{pm.icon} {pm.label} · {fmtMoney(total)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-4 flex items-center gap-4">
          {appt.pets?.photo_url
            ? <img src={appt.pets.photo_url} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border-2 border-white/30" alt="" />
            : <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">🐶</div>}
          <div className="flex-1">
            <p className="text-xl font-black text-white">{appt.pets?.name}</p>
            <p className="text-violet-200 text-sm">{appt.clients?.name} · {(serviceLabels ?? SERVICE_LABELS)[appt.service] ?? appt.service}</p>
            <p className="text-violet-300 text-xs">{fmt12(appt.appointment_time)}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Payment method */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Method</p>
            <div className="grid grid-cols-4 gap-2">
              {(['card', 'cash', 'zelle', 'venmo'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`py-3 rounded-2xl font-bold text-sm transition-all flex flex-col items-center gap-1 border-2 ${
                    method === m
                      ? `${PM[m].bg} ${PM[m].text} ${PM[m].border} scale-105 shadow-sm`
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}>
                  <span className="text-xl">{PM[m].icon}</span>
                  <span className="text-xs">{PM[m].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Service amount */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service Total</p>
            <div className={`flex items-center rounded-2xl border-2 overflow-hidden ${pm.border} ${pm.bg}`}>
              <span className={`text-lg font-black px-4 py-3 border-r-2 ${pm.border} ${pm.text}`}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={amount} onChange={e => { setAmount(e.target.value); setDiscount(false) }}
                placeholder="0.00" autoFocus
                className={`flex-1 text-xl font-black py-3 px-4 bg-transparent focus:outline-none ${pm.text} placeholder:text-gray-300`}
              />
            </div>
            {/* First-time discount toggle — only for new customers */}
            {rawAmt > 0 && isFirstTime === true && (
              <button
                onClick={() => setDiscount(d => !d)}
                className={`mt-2 w-full flex items-center justify-between rounded-2xl px-4 py-2.5 border-2 transition-all ${
                  discount
                    ? 'bg-pink-50 border-pink-300 text-pink-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-pink-200 hover:text-pink-500'
                }`}>
                <span className="font-bold text-sm">🎉 First-time customer 20% off</span>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${discount ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {discount ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
          </div>

          {/* Tips */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Tip {method !== 'card' ? '(enter manually)' : '(select % or enter)'}
            </p>
            {/* Card: show % shortcuts */}
            {method === 'card' && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {cardTipPcts.map(pct => (
                  <button key={pct} onClick={() => setTipPct(pct)}
                    disabled={!serviceAmt}
                    className={`py-2 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-30 ${
                      tip === (serviceAmt * pct / 100).toFixed(2)
                        ? 'bg-sky-500 text-white border-sky-500'
                        : 'bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100'
                    }`}>
                    {pct}%
                    {serviceAmt > 0 && <span className="block text-[10px] opacity-70">${(serviceAmt * pct / 100).toFixed(2)}</span>}
                  </button>
                ))}
              </div>
            )}
            {/* All methods: manual tip input */}
            <div className={`flex items-center rounded-2xl border-2 overflow-hidden ${
              method === 'card' ? 'border-sky-200 bg-sky-50' :
              method === 'cash' ? 'border-green-200 bg-green-50' :
              method === 'zelle' ? 'border-yellow-200 bg-yellow-50' :
              'border-blue-200 bg-blue-50'
            }`}>
              <span className={`text-sm font-bold px-4 py-2.5 border-r-2 ${pm.border} ${pm.text}`}>Tip $</span>
              <input
                type="number" min="0" step="0.01"
                value={tip} onChange={e => setTip(e.target.value)}
                placeholder="0.00"
                className={`flex-1 text-lg font-black py-2.5 px-4 bg-transparent focus:outline-none ${pm.text} placeholder:text-gray-300`}
              />
              {tip && parseFloat(tip) > 0 && (
                <button onClick={() => setTip('')}
                  className="px-3 text-gray-300 hover:text-gray-500 text-lg">✕</button>
              )}
            </div>
          </div>

          {/* Total */}
          <div className={`rounded-2xl border-2 ${pm.border} ${pm.bg} px-5 py-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-bold ${pm.text} opacity-70`}>Service</p>
                {discount && discountAmt > 0 && (
                  <p className="text-xs text-pink-500 font-semibold">🎉 20% off</p>
                )}
                <p className={`text-xs ${pm.text} opacity-60`}>Tip</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  {discount && rawAmt > 0 && (
                    <span className="text-xs text-gray-400 line-through">{fmtMoney(amount)}</span>
                  )}
                  <p className={`text-sm font-bold ${discount ? 'text-pink-600' : pm.text}`}>{fmtMoney(serviceAmt.toFixed(2))}</p>
                </div>
                {discount && discountAmt > 0 && (
                  <p className="text-xs text-pink-400">−{fmtMoney(discountAmt.toFixed(2))}</p>
                )}
                <p className={`text-xs ${pm.text} opacity-70`}>+{fmtMoney(tip || '0')}</p>
              </div>
            </div>
            <div className={`border-t-2 ${pm.border} mt-3 pt-3 flex items-center justify-between`}>
              <p className={`text-lg font-black ${pm.text}`}>Total</p>
              <p className={`text-3xl font-black ${discount ? 'text-pink-600' : pm.text}`}>{fmtMoney(total)}</p>
            </div>
          </div>

          {/* Confirm */}
          <button
            onClick={confirm}
            disabled={!amount || saving}
            className={`w-full py-4 rounded-2xl font-black text-xl text-white shadow-lg disabled:opacity-40 transition-all active:scale-95 ${
              method === 'card'  ? 'bg-sky-500 hover:bg-sky-600' :
              method === 'cash'  ? 'bg-green-500 hover:bg-green-600' :
              method === 'zelle' ? 'bg-yellow-500 hover:bg-yellow-600' :
                                   'bg-blue-500 hover:bg-blue-600'
            }`}>
            {saving ? 'Saving…' : `${pm.icon} Confirm ${pm.label} · ${fmtMoney(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Group Checkout Modal (multiple dogs, one client) ──────────────────────────
function GroupCheckoutModal({
  appts,
  onClose,
  onSuccess,
  serviceLabels,
}: {
  appts: Appt[]
  onClose: () => void
  onSuccess: (updates: { id: string; updated: Partial<Appt> }[]) => void
  serviceLabels?: Record<string, string>
}) {
  const [method, setMethod] = useState<'card' | 'cash' | 'venmo' | 'zelle'>('card')
  const [amounts, setAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(appts.map(a => [a.id, a.payment_amount || '']))
  )
  const [tip, setTip] = useState('')
  const [discount, setDiscount] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // First-time = none of these pets has a prior recorded payment.
  useEffect(() => {
    let cancelled = false
    Promise.all(appts.map(a =>
      a.pets?.id
        ? fetch(`/api/groomer/last-payment?pet_id=${a.pets.id}&exclude_id=${a.id}`).then(r => r.json()).then(d => !d.amount).catch(() => false)
        : Promise.resolve(false)
    )).then(results => { if (!cancelled) setIsFirstTime(results.every(Boolean)) })
    return () => { cancelled = true }
  }, [appts])

  const owner = appts[0]?.clients?.name ?? ''
  const rawSubtotal = appts.reduce((s, a) => s + (parseFloat(amounts[a.id]) || 0), 0)
  const discountAmt = discount ? Math.round(rawSubtotal * 0.20 * 100) / 100 : 0
  const serviceSubtotal = rawSubtotal - discountAmt
  const tipAmt = parseFloat(tip) || 0
  const total = serviceSubtotal + tipAmt
  const allHaveAmount = appts.every(a => (parseFloat(amounts[a.id]) || 0) > 0)

  const cardTipPcts = [15, 18, 20, 25]
  const setTipPct = (pct: number) => setTip((serviceSubtotal * pct / 100).toFixed(2))

  const pm = PM[method]

  const confirm = async () => {
    if (!allHaveAmount) return
    setSaving(true)
    try {
      // Each dog's discounted service amount, then proportional tip split.
      const serviceAmts = appts.map(a => {
        const raw = parseFloat(amounts[a.id]) || 0
        return discount ? Math.round(raw * 0.80 * 100) / 100 : raw
      })
      const tipParts = splitTip(serviceAmts, tipAmt)

      const results = await Promise.all(appts.map((a, i) => {
        const raw = parseFloat(amounts[a.id]) || 0
        const dDiscount = discount ? Math.round(raw * 0.20 * 100) / 100 : 0
        return fetch(`/api/admin/appointments/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'record-payment',
            payment_amount: serviceAmts[i].toFixed(2),
            tip_amount: tipParts[i].toFixed(2),
            payment_method: method,
            payment_status: 'paid',
            discount_label: discount ? 'First-time customer 20% off' : null,
            discount_percent: discount ? '20' : null,
            discount_amount: discount ? dDiscount.toFixed(2) : null,
          }),
        }).then(r => r.json()).then(d => ({ ok: !!d.success, i }))
      }))

      if (results.every(r => r.ok)) {
        setDone(true)
        onSuccess(appts.map((a, i) => ({
          id: a.id,
          updated: {
            payment_amount: serviceAmts[i].toFixed(2),
            tip_amount: tipParts[i].toFixed(2),
            payment_method: method,
            payment_status: 'paid',
          },
        })))
        setTimeout(onClose, 1200)
      }
    } catch {/**/}
    setSaving(false)
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative bg-white rounded-3xl p-10 text-center shadow-2xl">
          <p className="text-6xl mb-3">✅</p>
          <p className="text-2xl font-black text-gray-800">{appts.length} Payments Recorded!</p>
          <p className="text-gray-400 mt-1">{pm.icon} {pm.label} · {fmtMoney(total)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-4 flex items-center gap-4 flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">🐾</div>
          <div className="flex-1">
            <p className="text-xl font-black text-white">{appts.length} pets · pay together</p>
            <p className="text-violet-200 text-sm">{owner} · {appts.map(a => a.pets?.name).filter(Boolean).join(' & ')}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Payment method */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Method</p>
            <div className="grid grid-cols-4 gap-2">
              {(['card', 'cash', 'zelle', 'venmo'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`py-3 rounded-2xl font-bold text-sm transition-all flex flex-col items-center gap-1 border-2 ${
                    method === m
                      ? `${PM[m].bg} ${PM[m].text} ${PM[m].border} scale-105 shadow-sm`
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}>
                  <span className="text-xl">{PM[m].icon}</span>
                  <span className="text-xs">{PM[m].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Per-dog service amounts */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service Amount per Pet</p>
            <div className="space-y-2">
              {appts.map(a => (
                <div key={a.id} className="flex items-center gap-3">
                  {a.pets?.photo_url
                    ? <img src={a.pets.photo_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" />
                    : <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{a.pets?.name}</p>
                    <p className="text-gray-400 text-xs truncate">{(serviceLabels ?? SERVICE_LABELS)[a.service] ?? a.service}</p>
                  </div>
                  <div className={`flex items-center rounded-xl border-2 overflow-hidden ${pm.border} ${pm.bg} w-32`}>
                    <span className={`text-sm font-black px-2.5 py-2 border-r-2 ${pm.border} ${pm.text}`}>$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={amounts[a.id]} onChange={e => { setAmounts(prev => ({ ...prev, [a.id]: e.target.value })); setDiscount(false) }}
                      placeholder="0.00"
                      className={`flex-1 w-full text-base font-black py-2 px-2 bg-transparent focus:outline-none ${pm.text} placeholder:text-gray-300`}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* First-time discount toggle — only when every pet is new */}
            {rawSubtotal > 0 && isFirstTime === true && (
              <button
                onClick={() => setDiscount(d => !d)}
                className={`mt-2 w-full flex items-center justify-between rounded-2xl px-4 py-2.5 border-2 transition-all ${
                  discount
                    ? 'bg-pink-50 border-pink-300 text-pink-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-pink-200 hover:text-pink-500'
                }`}>
                <span className="font-bold text-sm">🎉 First-time customer 20% off</span>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${discount ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {discount ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
          </div>

          {/* Tip (on combined subtotal) */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Tip {method === 'card' ? '(select % or enter)' : '(enter manually)'} · split across pets
            </p>
            {method === 'card' && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {cardTipPcts.map(pct => (
                  <button key={pct} onClick={() => setTipPct(pct)}
                    disabled={!serviceSubtotal}
                    className={`py-2 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-30 ${
                      tip === (serviceSubtotal * pct / 100).toFixed(2)
                        ? 'bg-sky-500 text-white border-sky-500'
                        : 'bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100'
                    }`}>
                    {pct}%
                    {serviceSubtotal > 0 && <span className="block text-[10px] opacity-70">${(serviceSubtotal * pct / 100).toFixed(2)}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className={`flex items-center rounded-2xl border-2 overflow-hidden ${
              method === 'card' ? 'border-sky-200 bg-sky-50' :
              method === 'cash' ? 'border-green-200 bg-green-50' :
              method === 'zelle' ? 'border-yellow-200 bg-yellow-50' :
              'border-blue-200 bg-blue-50'
            }`}>
              <span className={`text-sm font-bold px-4 py-2.5 border-r-2 ${pm.border} ${pm.text}`}>Tip $</span>
              <input
                type="number" min="0" step="0.01"
                value={tip} onChange={e => setTip(e.target.value)}
                placeholder="0.00"
                className={`flex-1 text-lg font-black py-2.5 px-4 bg-transparent focus:outline-none ${pm.text} placeholder:text-gray-300`}
              />
              {tip && parseFloat(tip) > 0 && (
                <button onClick={() => setTip('')} className="px-3 text-gray-300 hover:text-gray-500 text-lg">✕</button>
              )}
            </div>
          </div>

          {/* Total */}
          <div className={`rounded-2xl border-2 ${pm.border} ${pm.bg} px-5 py-4`}>
            <div className="flex items-center justify-between text-sm">
              <span className={`font-bold ${pm.text} opacity-70`}>Service ({appts.length} pets)</span>
              <div className="flex items-center gap-2">
                {discount && rawSubtotal > 0 && <span className="text-xs text-gray-400 line-through">{fmtMoney(rawSubtotal.toFixed(2))}</span>}
                <span className={`font-bold ${discount ? 'text-pink-600' : pm.text}`}>{fmtMoney(serviceSubtotal.toFixed(2))}</span>
              </div>
            </div>
            {discount && discountAmt > 0 && (
              <div className="flex items-center justify-between text-xs text-pink-500 mt-0.5">
                <span>🎉 20% off</span><span>−{fmtMoney(discountAmt.toFixed(2))}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs mt-0.5">
              <span className={`${pm.text} opacity-60`}>Tip</span>
              <span className={`${pm.text} opacity-70`}>+{fmtMoney(tip || '0')}</span>
            </div>
            <div className={`border-t-2 ${pm.border} mt-3 pt-3 flex items-center justify-between`}>
              <p className={`text-lg font-black ${pm.text}`}>Total</p>
              <p className={`text-3xl font-black ${discount ? 'text-pink-600' : pm.text}`}>{fmtMoney(total)}</p>
            </div>
          </div>

          {/* Confirm */}
          <button
            onClick={confirm}
            disabled={!allHaveAmount || saving}
            className={`w-full py-4 rounded-2xl font-black text-xl text-white shadow-lg disabled:opacity-40 transition-all active:scale-95 ${
              method === 'card'  ? 'bg-sky-500 hover:bg-sky-600' :
              method === 'cash'  ? 'bg-green-500 hover:bg-green-600' :
              method === 'zelle' ? 'bg-yellow-500 hover:bg-yellow-600' :
                                   'bg-blue-500 hover:bg-blue-600'
            }`}>
            {saving ? 'Saving…' : `${pm.icon} Pay ${appts.length} pets · ${fmtMoney(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Phone search (check-in tab) ───────────────────────────────────────────────
function PhoneSearch({ onDone, serviceLabels }: { onDone: () => void; serviceLabels?: Record<string, string> }) {
  const [phone, setPhone] = useState('')
  const [results, setResults] = useState<Appt[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const search = async () => {
    if (phone.replace(/\D/g, '').length < 10) return
    setLoading(true); setResults(null); setMsg(null)
    const r = await fetch(`/api/kiosk/lookup?phone=${encodeURIComponent(phone)}&mode=checkin`)
    const d = await r.json()
    setResults(d.appointments ?? [])
    if ((d.appointments ?? []).length === 0) setMsg({ type: 'err', text: 'No appointment found for that number today.' })
    setLoading(false)
  }

  const doCheckin = async (appt: Appt) => {
    setSubmitting(appt.id)
    await fetch('/api/kiosk/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkin', appointmentId: appt.id }),
    })
    setMsg({ type: 'ok', text: `✅ ${appt.pets?.name ?? 'Pet'} checked in!` })
    setResults(null); setPhone(''); setSubmitting(null)
    setTimeout(onDone, 1500)
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex gap-3">
        <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Client phone number" type="tel"
          className="flex-1 border-2 border-gray-200 rounded-2xl px-5 py-4 text-xl focus:outline-none focus:border-violet-400" />
        <button onClick={search} disabled={loading}
          className="bg-violet-600 text-white font-black px-8 py-4 rounded-2xl text-xl hover:bg-violet-700 disabled:opacity-40 transition-colors">
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {msg && <div className={`rounded-2xl px-5 py-4 font-bold text-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{msg.text}</div>}
      {results && results.map(a => (
        <div key={a.id} className="bg-white border-2 border-gray-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          {a.pets?.photo_url
            ? <img src={a.pets.photo_url} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt="" />
            : <div className="w-16 h-16 rounded-xl bg-violet-100 flex items-center justify-center text-3xl flex-shrink-0">🐶</div>}
          <div className="flex-1">
            <p className="text-2xl font-black text-gray-800">{a.pets?.name} <span className="text-gray-400 font-normal text-lg">· {a.clients?.name}</span></p>
            <p className="text-gray-500">{(serviceLabels ?? SERVICE_LABELS)[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
          </div>
          <button onClick={() => doCheckin(a)} disabled={!!submitting}
            className="font-black px-6 py-3 rounded-2xl text-lg text-white shadow bg-sky-500 hover:bg-sky-600 disabled:opacity-40 transition-colors">
            {submitting === a.id ? '…' : '✓ Check In'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── New Client form ───────────────────────────────────────────────────────────
function NewClientForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', petName: '', breed: '', weight: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone.replace(/\D/g, ''), clientName: form.name, email: form.email, petName: form.petName, breed: form.breed, weight: form.weight, newClientOnly: true }),
      })
      const d = await r.json()
      if (r.ok || d.clientCreated) {
        setMsg({ type: 'ok', text: `✅ ${form.name} and ${form.petName} added!` })
        setForm({ name: '', phone: '', email: '', petName: '', breed: '', weight: '' })
        setTimeout(onDone, 2000)
      } else {
        const { error: ce } = await supabase.from('clients').insert({ name: form.name, phone: form.phone.replace(/\D/g, ''), email: form.email || null })
        if (ce && !ce.message.includes('duplicate')) { setMsg({ type: 'err', text: ce.message }); setLoading(false); return }
        if (form.petName) await supabase.from('pets').insert({ name: form.petName, breed: form.breed || null, weight: form.weight || null, client_phone: form.phone.replace(/\D/g, ''), vaccine_status: 'pending' })
        setMsg({ type: 'ok', text: `✅ ${form.name} and ${form.petName || 'pet'} added!` })
        setForm({ name: '', phone: '', email: '', petName: '', breed: '', weight: '' })
        setTimeout(onDone, 2000)
      }
    } catch { setMsg({ type: 'err', text: 'Something went wrong. Try again.' }) }
    setLoading(false)
  }

  const Field = ({ label, k, placeholder, type = 'text' }: { label: string; k: string; placeholder: string; type?: string }) => (
    <div>
      <label className="block text-sm font-bold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
      <input type={type} value={(form as Record<string, string>)[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-violet-400" />
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl">
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 space-y-4">
        <p className="font-black text-sky-700 text-lg">👤 Client Info</p>
        <Field label="Full Name *" k="name" placeholder="Jane Smith" />
        <Field label="Phone *" k="phone" placeholder="(555) 123-4567" type="tel" />
        <Field label="Email" k="email" placeholder="jane@email.com" type="email" />
      </div>
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-4">
        <p className="font-black text-violet-700 text-lg">🐶 Pet Info</p>
        <Field label="Pet Name *" k="petName" placeholder="Buddy" />
        <Field label="Breed" k="breed" placeholder="Poodle Mix" />
        <Field label="Weight (lbs)" k="weight" placeholder="12" />
      </div>
      {msg && <div className={`rounded-2xl px-5 py-4 font-bold text-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{msg.text}</div>}
      <button type="submit" disabled={loading || !form.name || !form.phone || !form.petName}
        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black py-4 rounded-2xl text-xl shadow-lg disabled:opacity-40 transition-colors">
        {loading ? 'Saving…' : '+ Add Client & Pet'}
      </button>
    </form>
  )
}


// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function CashierPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [allAppts, setAllAppts] = useState<Appt[]>([])
  const [weekTotal, setWeekTotal] = useState<number | null>(null)
  const [monthTotal, setMonthTotal] = useState<number | null>(null)
  const [weekCount, setWeekCount] = useState(0)
  const [monthCount, setMonthCount] = useState(0)
  const [alerts, setAlerts] = useState<{ id: string; pet: string; owner: string; method: string; amount: string | null; tip: string | null; time: string }[]>([])
  const [now, setNow] = useState(new Date())
  const [checkoutAppt, setCheckoutAppt] = useState<Appt | null>(null)
  const [groupCheckout, setGroupCheckout] = useState<Appt[] | null>(null)
  const [cashPopup, setCashPopup] = useState<Appt | null>(null)
  const [vzPopup, setVzPopup] = useState<Appt | null>(null)
  const [vzTipInput, setVzTipInput] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [confirmingPopup, setConfirmingPopup] = useState(false)
  const [staffList, setStaffList] = useState<string[]>([])
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }
  const seenIds = useRef<Set<string>>(new Set())
  const seenCashIds = useRef<Set<string>>(new Set())
  const seenVZIds = useRef<Set<string>>(new Set())
  const isFirst = useRef(true)

  // Derived lists — use Pacific Time so date doesn't flip at 5 PM
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const todayAppts = allAppts.filter(a => a.appointment_date === today && a.status !== 'cancelled' && a.status !== 'no_show')
  const unpaid = todayAppts.filter(a =>
    (a.status === 'completed' || a.grooming_status === 'ready' || a.grooming_status === 'done')
    && a.payment_status !== 'paid' && a.payment_status !== 'cash_pending'
    && a.payment_status !== 'venmo_pending' && a.payment_status !== 'zelle_pending'
  )
  // Group unpaid dogs by client (normalized phone) so a family can pay together.
  const unpaidGroups: Appt[][] = (() => {
    const byPhone = new Map<string, Appt[]>()
    const order: string[] = []
    for (const a of unpaid) {
      const key = normalizePhone(a.clients?.phone) || `id:${a.id}`
      if (!byPhone.has(key)) { byPhone.set(key, []); order.push(key) }
      byPhone.get(key)!.push(a)
    }
    return order.map(k => byPhone.get(k)!)
  })()
  const cashPending = todayAppts.filter(a => a.payment_status === 'cash_pending')
  const vzPending = todayAppts.filter(a => a.payment_status === 'venmo_pending' || a.payment_status === 'zelle_pending')
  const paid = todayAppts.filter(a => a.payment_status === 'paid')
  const checkins = todayAppts.filter(a => ['confirmed', 'in_progress'].includes(a.status) && a.grooming_status !== 'ready' && a.grooming_status !== 'done')
  const waitingCheckin = todayAppts.filter(a => ['pending', 'confirmed'].includes(a.status) && !a.grooming_status)
  const inSalon = todayAppts.filter(a => !!a.grooming_status && ['waiting', 'incare'].includes(a.grooming_status) && a.payment_status !== 'paid')

  // Include cash_pending in totals — money was collected, just needs physical handover
  const allCollected = [...paid, ...cashPending]
  const totalService = allCollected.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0)
  const totalTips = allCollected.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0)

  const revenue = allCollected.reduce((acc, a) => {
    const m = a.payment_method ?? 'unknown'
    const amt = parseFloat(a.payment_amount ?? '0') || 0
    const tip = parseFloat(a.tip_amount ?? '0') || 0
    acc[m] = { amount: (acc[m]?.amount ?? 0) + amt, tips: (acc[m]?.tips ?? 0) + tip, count: (acc[m]?.count ?? 0) + 1 }
    return acc
  }, {} as Record<string, { amount: number; tips: number; count: number }>)

  const fetchData = useCallback(async () => {
    try {
      const _now = new Date(); if (_now.getHours() < 4) _now.setDate(_now.getDate() - 1)
      const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`
      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_time, appointment_date, service, status, grooming_status, payment_method, payment_amount, tip_amount, payment_status, assigned_groomer, assigned_bather, pets(id, name, breed, photo_url), clients(name, phone)')
        .eq('appointment_date', todayStr)
        .order('appointment_time', { ascending: true })

      const list = (data ?? []) as Appt[]

      // Detect newly paid (for chime + alert)
      const newlyPaid = list.filter(a => a.payment_status === 'paid' && !seenIds.current.has(a.id))
      if (!isFirst.current && newlyPaid.length > 0) {
        try {
          const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15); osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.3)
          gain.gain.setValueAtTime(0.4, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8)
        } catch {}
        setAlerts(prev => [
          ...newlyPaid.map(a => ({ id: a.id, pet: a.pets?.name ?? 'Pet', owner: a.clients?.name ?? '', method: a.payment_method ?? 'unknown', amount: a.payment_amount, tip: a.tip_amount, time: a.appointment_time })),
          ...prev,
        ].slice(0, 20))
      }
      list.filter(a => a.payment_status === 'paid').forEach(a => seenIds.current.add(a.id))

      // Detect newly cash-pending — pop modal + chime
      const newlyCash = list.filter(a => a.payment_status === 'cash_pending' && !seenCashIds.current.has(a.id))
      if (newlyCash.length > 0) {
        if (!isFirst.current) {
          try {
            const ctx = new AudioContext()
            for (let i = 0; i < 2; i++) {
              const osc = ctx.createOscillator(); const gain = ctx.createGain()
              osc.connect(gain); gain.connect(ctx.destination); osc.type = 'triangle'
              const t = ctx.currentTime + i * 0.35
              osc.frequency.setValueAtTime(660, t); osc.frequency.setValueAtTime(880, t + 0.1)
              gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
              osc.start(t); osc.stop(t + 0.3)
            }
          } catch {}
        }
        newlyCash.forEach(a => seenCashIds.current.add(a.id))
        setCashPopup(newlyCash[0])
        setCashReceived('')
      }
      list.filter(a => a.payment_status === 'paid').forEach(a => seenCashIds.current.delete(a.id))

      // Detect newly venmo/zelle-pending — pop modal + chime
      const newlyVZ = list.filter(a => (a.payment_status === 'venmo_pending' || a.payment_status === 'zelle_pending') && !seenVZIds.current.has(a.id))
      if (newlyVZ.length > 0) {
        if (!isFirst.current) {
          try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator(); const gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'
            osc.frequency.setValueAtTime(1100, ctx.currentTime); osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.3)
            gain.gain.setValueAtTime(0.4, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
          } catch {}
        }
        newlyVZ.forEach(a => seenVZIds.current.add(a.id))
        setVzPopup(newlyVZ[0])
      }
      list.filter(a => a.payment_status === 'paid').forEach(a => seenVZIds.current.delete(a.id))
      isFirst.current = false
      setAllAppts(list)
    } catch (e) { console.error(e) }
  }, [])

  const fetchPeriodTotals = useCallback(async () => {
    try {
      const _now = new Date()
      if (_now.getHours() < 4) _now.setDate(_now.getDate() - 1)
      // Week: Monday → today
      const dow = _now.getDay() === 0 ? 6 : _now.getDay() - 1 // Mon=0
      const weekStart = new Date(_now); weekStart.setDate(_now.getDate() - dow)
      const weekStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`
      const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`
      // Month: 1st → today
      const monthStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-01`

      const [wRes, mRes] = await Promise.all([
        supabase.from('appointments').select('payment_amount, tip_amount').eq('payment_status', 'paid').gte('appointment_date', weekStr).lte('appointment_date', todayStr),
        supabase.from('appointments').select('payment_amount, tip_amount').eq('payment_status', 'paid').gte('appointment_date', monthStr).lte('appointment_date', todayStr),
      ])
      const sum = (rows: {payment_amount:string|null;tip_amount:string|null}[]) =>
        rows.reduce((s, r) => s + parseFloat(r.payment_amount||'0') + parseFloat(r.tip_amount||'0'), 0)
      if (wRes.data) { setWeekTotal(sum(wRes.data)); setWeekCount(wRes.data.length) }
      if (mRes.data) { setMonthTotal(sum(mRes.data)); setMonthCount(mRes.data.length) }
    } catch { /**/ }
  }, [])

  useEffect(() => {
    fetchData()
    fetchPeriodTotals()
    const iv = setInterval(fetchData, 8000)
    const ck = setInterval(() => setNow(new Date()), 30000)
    const wv = setInterval(fetchPeriodTotals, 60000) // refresh week/month every minute
    // Load staff list
    fetch('/api/admin/staff').then(r => r.json()).then(d => {
      setStaffList((d.staff ?? []).map((s: { name: string }) => s.name).filter(Boolean))
    }).catch(() => {})
    // Load services so dynamic service names display correctly
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { setServiceDefs(JSON.parse(svcVal)) } catch { /* ignore */ } }
    }).catch(() => {})
    return () => { clearInterval(iv); clearInterval(ck); clearInterval(wv) }
  }, [fetchData, fetchPeriodTotals])

  const assignStaff = async (apptId: string, groomer: string | null, bather: string | null) => {
    setAssigningId(apptId)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign-staff', assigned_groomer: groomer, assigned_bather: bather }),
      })
      if (res.ok) {
        setAllAppts(prev => prev.map(a => a.id === apptId
          ? { ...a, assigned_groomer: groomer, assigned_bather: bather }
          : a
        ))
      }
    } catch { /* silent */ }
    finally { setAssigningId(null) }
  }

  const handlePaymentSuccess = (apptId: string, updated: Partial<Appt>) => {
    setAllAppts(prev => prev.map(a => a.id === apptId ? { ...a, ...updated } : a))
    seenIds.current.add(apptId)
  }

  const handleGroupPaymentSuccess = (updates: { id: string; updated: Partial<Appt> }[]) => {
    const map = new Map(updates.map(u => [u.id, u.updated]))
    setAllAppts(prev => prev.map(a => map.has(a.id) ? { ...a, ...map.get(a.id)! } : a))
    updates.forEach(u => seenIds.current.add(u.id))
  }

  const confirmCashPopup = async (appt: Appt, tip: number | null) => {
    setConfirmingPopup(true)
    try {
      const body: Record<string, string | null> = { action: 'record-payment', payment_status: 'paid', payment_method: 'cash' }
      if (tip !== null && tip > 0) body.tip_amount = tip.toFixed(2)
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) { setCashPopup(null); setCashReceived(''); await fetchData() }
    } catch {}
    setConfirmingPopup(false)
  }

  const confirmVzPopup = async (appt: Appt) => {
    setConfirmingPopup(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record-payment', payment_status: 'paid', payment_method: appt.payment_method }),
      })
      if (res.ok) { setVzPopup(null); await fetchData() }
    } catch {}
    setConfirmingPopup(false)
  }

  const [checkinLoading, setCheckinLoading] = useState<string | null>(null)
  const handleQuickCheckin = async (appt: Appt) => {
    setCheckinLoading(appt.id)
    try {
      await fetch('/api/kiosk/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin', appointmentId: appt.id }),
      })
      setAllAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'in_progress' } : a))
    } catch {}
    setCheckinLoading(null)
  }

  const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'checkin',   label: 'Upcoming',   icon: '🐾' },
    { id: 'checkout',  label: 'Ready to Go', icon: '💰' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── VENMO / ZELLE POPUP ─────────────────────────────────────────────── */}
      {vzPopup && (() => {
        const isVenmo = vzPopup.payment_method === 'venmo'
        const svc  = parseFloat(vzPopup.payment_amount || '0')
        const amountReceived = parseFloat(vzTipInput) || 0
        const calculatedTip = Math.max(0, amountReceived - svc)
        const total = amountReceived
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className={`px-6 py-5 flex items-center gap-4 ${isVenmo ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-gradient-to-r from-yellow-400 to-amber-500'}`}>
                {vzPopup.pets?.photo_url
                  ? <img src={vzPopup.pets.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                  : <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">🐶</div>}
                <div className="text-white min-w-0 flex-1">
                  <p className="text-2xl font-black leading-tight">{vzPopup.pets?.name || '—'}</p>
                  <p className="text-sm font-medium opacity-90">{vzPopup.clients?.name}</p>
                  <p className="text-sm opacity-75">{vzPopup.clients?.phone} · {fmt12(vzPopup.appointment_time)}</p>
                </div>
                <div className="text-4xl">{isVenmo ? '💜' : '💛'}</div>
              </div>
              <div className="px-6 pt-5 pb-4 space-y-4">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isVenmo ? 'text-indigo-500' : 'text-amber-500'}`}>
                    {isVenmo ? 'Venmo' : 'Zelle'} Payment — Please Verify
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{serviceMap[vzPopup.service] || vzPopup.service}</span>
                      <span className="font-semibold text-gray-800">{fmtMoney(svc)}</span>
                    </div>
                  </div>
                </div>

                {/* Amount received input */}
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Amount Received</p>
                  <div className="flex items-center gap-2 bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-3">
                    <span className={`text-2xl font-bold ${isVenmo ? 'text-indigo-600' : 'text-amber-600'}`}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vzTipInput}
                      onChange={e => setVzTipInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder={fmtMoney(svc)}
                      className="flex-1 text-2xl font-bold text-gray-800 outline-none bg-transparent placeholder-gray-300"
                    />
                  </div>
                </div>

                {amountReceived > 0 && (
                  <div className={`space-y-1 pt-2 border-t border-gray-100 ${calculatedTip > 0 ? '' : ''}`}>
                    {calculatedTip > 0 && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Tip included</span>
                        <span className={`font-semibold ${isVenmo ? 'text-indigo-600' : 'text-amber-600'}`}>+{fmtMoney(calculatedTip)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-black">
                      <span className="text-gray-600">Total Received</span>
                      <span className={isVenmo ? 'text-indigo-700' : 'text-amber-700'}>{fmtMoney(total)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => { seenVZIds.current.add(vzPopup.id); setVzPopup(null); setVzTipInput('') }}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50"
                >Later</button>
                <button
                  onClick={async () => {
                    if (!vzTipInput || parseFloat(vzTipInput) < svc) {
                      alert('Please enter an amount equal to or greater than the service amount')
                      return
                    }
                    setConfirmingPopup(true)
                    try {
                      const receivedAmt = parseFloat(vzTipInput)
                      const calculatedTip = Math.max(0, receivedAmt - svc)
                      const res = await fetch(`/api/admin/appointments/${vzPopup.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'record-payment',
                          payment_amount: vzPopup.payment_amount,
                          tip_amount: calculatedTip.toFixed(2),
                          payment_method: vzPopup.payment_method,
                          payment_status: 'paid',
                        }),
                      })
                      if (res.ok) { setVzPopup(null); setVzTipInput(''); await fetchData() }
                    } catch {}
                    finally { setConfirmingPopup(false) }
                  }}
                  disabled={confirmingPopup}
                  className={`flex-[2] py-3 rounded-2xl text-white font-black text-base shadow-lg disabled:opacity-40 active:scale-95 transition-all ${isVenmo ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-amber-400 hover:bg-amber-500'}`}
                >
                  {confirmingPopup ? 'Saving…' : '✓ Verified — Mark Paid'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── CASH POPUP ──────────────────────────────────────────────────────── */}
      {cashPopup && (() => {
        const svc  = parseFloat(cashPopup.payment_amount || '0')
        const kioskTip = parseFloat(cashPopup.tip_amount || '0')
        const total = svc + kioskTip
        const given = parseFloat(cashReceived)
        const valid = !isNaN(given) && given > 0
        const tipFromCash = valid && given > svc ? +(given - svc).toFixed(2) : 0
        const change = valid ? +(given - total).toFixed(2) : null
        const canConfirm = valid && given >= svc
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 flex items-center gap-4">
                {cashPopup.pets?.photo_url
                  ? <img src={cashPopup.pets.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                  : <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">🐶</div>}
                <div className="text-white min-w-0">
                  <p className="text-2xl font-black leading-tight">{cashPopup.pets?.name || '—'}</p>
                  <p className="text-sm font-medium opacity-90">{cashPopup.clients?.name}</p>
                  <p className="text-sm opacity-75">{cashPopup.clients?.phone} · {fmt12(cashPopup.appointment_time)}</p>
                </div>
              </div>
              <div className="px-6 pt-5 pb-3 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{serviceMap[cashPopup.service] || cashPopup.service}</span>
                  <span className="font-semibold text-gray-800">{fmtMoney(svc)}</span>
                </div>
                {kioskTip > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Tip (kiosk)</span>
                    <span className="font-semibold text-emerald-600">+{fmtMoney(kioskTip)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-100 pt-2">
                  <span>Total Due</span><span>{fmtMoney(total)}</span>
                </div>
              </div>
              <div className="px-6 pb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">💵 Cash Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-400">$</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)} autoFocus
                    className="w-full pl-10 pr-4 py-4 text-3xl font-black text-gray-900 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-emerald-400 bg-gray-50" />
                </div>
                {valid && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-gray-100">
                    {tipFromCash > 0 && (
                      <div className="flex justify-between px-4 py-2.5 bg-emerald-50">
                        <span className="text-sm font-semibold text-emerald-700">Tip</span>
                        <span className="text-sm font-black text-emerald-700">+{fmtMoney(tipFromCash)}</span>
                      </div>
                    )}
                    {change !== null && (
                      <div className={`flex justify-between px-4 py-2.5 ${change < 0 ? 'bg-red-50' : change === 0 ? 'bg-gray-50' : 'bg-blue-50'}`}>
                        <span className={`text-sm font-semibold ${change < 0 ? 'text-red-600' : change === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                          {change < 0 ? '⚠️ Short by' : change === 0 ? 'Exact — no change' : 'Change to return'}
                        </span>
                        {change !== 0 && <span className={`text-sm font-black ${change < 0 ? 'text-red-600' : 'text-blue-700'}`}>{fmtMoney(Math.abs(change))}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => { seenCashIds.current.add(cashPopup.id); setCashPopup(null); setCashReceived('') }}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50"
                >Later</button>
                <button
                  onClick={() => confirmCashPopup(cashPopup, tipFromCash)}
                  disabled={!canConfirm || confirmingPopup}
                  className="flex-[2] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base shadow-lg shadow-emerald-200 disabled:opacity-40 active:scale-95 transition-all"
                >
                  {confirmingPopup ? 'Saving…' : '✓ Collected — Mark Paid'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a href="/front-desk" className="flex items-center gap-1 text-base text-gray-600 hover:text-gray-900 font-bold transition-colors">
              ← Back
            </a>
            <div className="w-px h-4 bg-gray-200" />
            <h1 className="text-2xl font-black text-gray-800">🐾 Kokoni Cashier</h1>
          </div>
          <p className="text-gray-400 text-sm">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          {unpaid.length > 0 && (
            <span className="bg-rose-100 text-rose-600 font-bold text-sm px-3 py-1.5 rounded-full animate-pulse">
              {unpaid.length} unpaid
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-4 font-black text-base transition-colors border-b-2 relative ${tab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t.icon} {t.label}
            {t.id === 'checkin' && waitingCheckin.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-sky-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{waitingCheckin.length}</span>
            )}
            {t.id === 'checkout' && (unpaid.length + cashPending.length) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{unpaid.length + cashPending.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-5xl mx-auto">

        {/* ── DASHBOARD TAB ── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {/* ── Period totals: Today / This Week / This Month ── */}
            <div className="grid grid-cols-3 gap-4">
              {/* Today */}
              <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg">
                <p className="text-violet-200 text-xs font-bold uppercase tracking-widest mb-1">Today</p>
                <p className="text-3xl font-black leading-tight">{fmtMoney(totalService + totalTips)}</p>
                <p className="text-violet-200 text-xs mt-1.5">
                  {fmtMoney(totalService)} svc
                  {totalTips > 0 && <span className="ml-1 text-emerald-300">+{fmtMoney(totalTips)} tip</span>}
                </p>
                <p className="text-violet-300 text-xs mt-0.5">{paid.length} paid · {unpaid.length} unpaid</p>
              </div>
              {/* This Week */}
              <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl p-5 text-white shadow-lg">
                <p className="text-sky-100 text-xs font-bold uppercase tracking-widest mb-1">This Week</p>
                <p className="text-3xl font-black leading-tight">
                  {weekTotal === null ? <span className="text-sky-200 text-xl">…</span> : fmtMoney(weekTotal)}
                </p>
                <p className="text-sky-100 text-xs mt-1.5">Mon – today</p>
                <p className="text-sky-200 text-xs mt-0.5">{weekCount} paid appointment{weekCount !== 1 ? 's' : ''}</p>
              </div>
              {/* This Month */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-1">This Month</p>
                <p className="text-3xl font-black leading-tight">
                  {monthTotal === null ? <span className="text-emerald-200 text-xl">…</span> : fmtMoney(monthTotal)}
                </p>
                <p className="text-emerald-100 text-xs mt-1.5">{now.toLocaleDateString('en-US', { month: 'long' })}</p>
                <p className="text-emerald-200 text-xs mt-0.5">{monthCount} paid appointment{monthCount !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* ── Payment method breakdown (today) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['card', 'cash', 'venmo', 'zelle'] as const).map(m => (
                <div key={m} className={`rounded-2xl p-4 border-2 ${PM[m].bg} ${PM[m].border}`}>
                  <p className={`text-sm font-bold uppercase tracking-wide ${PM[m].text}`}>{PM[m].icon} {PM[m].label}</p>
                  <p className={`text-2xl font-black mt-1 ${PM[m].text}`}>{fmtMoney((revenue[m]?.amount ?? 0) + (revenue[m]?.tips ?? 0))}</p>
                  <p className={`text-xs mt-0.5 ${PM[m].text} opacity-70`}>
                    {revenue[m]?.count ?? 0} payment{(revenue[m]?.count ?? 0) !== 1 ? 's' : ''}
                    {(revenue[m]?.tips ?? 0) > 0 && ` · +${fmtMoney(revenue[m]?.tips)} tip`}
                  </p>
                </div>
              ))}
            </div>

            {/* New payment alerts */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">🔔 New Payments</p>
                {alerts.slice(0, 4).map(a => {
                  const s = PM[a.method] ?? { bg: 'bg-gray-100', text: 'text-gray-600', icon: '💰', label: a.method, border: 'border-gray-200' }
                  const tip = parseFloat(a.tip || '0')
                  const svc = parseFloat(a.amount || '0')
                  return (
                    <div key={a.id} className={`flex items-center justify-between rounded-2xl border-2 px-5 py-3 ${s.bg} ${s.border}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{s.icon}</span>
                        <div>
                          <p className={`font-black ${s.text}`}>{a.pet}{a.owner ? ` (${a.owner})` : ''} — {s.label}</p>
                          <p className="text-gray-500 text-sm">
                            {fmtMoney(svc + tip)} total
                            {tip > 0 && <span className="ml-1 text-emerald-500">incl. {fmtMoney(tip)} tip</span>}
                            · {fmt12(a.time)}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} className="text-gray-400 text-sm font-bold hover:text-gray-600 ml-4">✓ Got it</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 🐾 Ready to collect payment — TOP PRIORITY */}
            <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-black text-gray-800">💰 Ready to Pay</h2>
                <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${(unpaid.length + cashPending.length) > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>{unpaid.length + cashPending.length}</span>
              </div>
              {unpaid.length === 0 && cashPending.length === 0 && vzPending.length === 0
                ? <p className="text-gray-400 text-center py-8">No one waiting to pay right now!</p>
                : <div className="divide-y divide-gray-50">
                  {cashPending.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-5 py-3 bg-green-50 hover:bg-green-100/40 transition-colors">
                      {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" /> : <div className="w-12 h-12 rounded-xl bg-green-200 flex items-center justify-center text-xl flex-shrink-0">🐶</div>}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-gray-800 truncate">{a.pets?.name} <span className="text-gray-400 font-normal text-sm">· {a.clients?.name}</span></p>
                        <p className="text-green-600 text-sm truncate font-bold">💵 Cash — waiting at desk</p>
                      </div>
                      <button onClick={() => setCheckoutAppt(a)}
                        className="flex-shrink-0 bg-green-500 hover:bg-green-600 text-white font-black px-4 py-2 rounded-xl text-sm shadow transition-colors">
                        💵 Collect
                      </button>
                    </div>
                  ))}
                  {vzPending.map(a => {
                    const isVenmo = a.payment_method === 'venmo'
                    return (
                      <div key={a.id} className={`flex items-center gap-3 px-5 py-3 ${isVenmo ? 'bg-indigo-50 hover:bg-indigo-100/40' : 'bg-yellow-50 hover:bg-yellow-100/40'} transition-colors`}>
                        {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" /> : <div className={`w-12 h-12 rounded-xl ${isVenmo ? 'bg-indigo-200' : 'bg-yellow-200'} flex items-center justify-center text-xl flex-shrink-0`}>🐶</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-800 truncate">{a.pets?.name} <span className="text-gray-400 font-normal text-sm">· {a.clients?.name}</span></p>
                          <p className={`text-sm truncate font-bold ${isVenmo ? 'text-indigo-600' : 'text-amber-600'}`}>{isVenmo ? '💜' : '💛'} {isVenmo ? 'Venmo' : 'Zelle'} — verify received</p>
                        </div>
                        <button onClick={() => setVzPopup(a)}
                          className={`flex-shrink-0 text-white font-black px-4 py-2 rounded-xl text-sm shadow transition-colors ${isVenmo ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                          {isVenmo ? '💜' : '💛'} Verify
                        </button>
                      </div>
                    )
                  })}
                  {unpaidGroups.map(group => group.length === 1 ? (
                    (a => (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-3 hover:bg-rose-50/30 transition-colors">
                        {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" /> : <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-xl flex-shrink-0">🐶</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-800 truncate">{a.pets?.name} <span className="text-gray-400 font-normal text-sm">· {a.clients?.name}</span></p>
                          <p className="text-gray-400 text-sm truncate">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                        </div>
                        <button onClick={() => setCheckoutAppt(a)}
                          className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 text-white font-black px-4 py-2 rounded-xl text-sm shadow transition-colors">
                          💳 Pay
                        </button>
                      </div>
                    ))(group[0])
                  ) : (
                    <div key={group[0].id} className="bg-violet-50/40 border-y border-violet-100">
                      <div className="flex items-center justify-between px-5 pt-3 pb-2">
                        <p className="text-xs font-black text-violet-600 uppercase tracking-wide">🐾 {group[0].clients?.name} · {group.length} pets</p>
                        <button onClick={() => setGroupCheckout(group)}
                          className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 text-white font-black px-4 py-2 rounded-xl text-sm shadow transition-colors">
                          💳 Pay all {group.length} together
                        </button>
                      </div>
                      {group.map(a => (
                        <div key={a.id} className="flex items-center gap-3 px-5 py-2 pl-7 hover:bg-violet-100/30 transition-colors">
                          {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" /> : <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-800 truncate">{a.pets?.name}</p>
                            <p className="text-gray-400 text-xs truncate">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                          </div>
                          <button onClick={() => setCheckoutAppt(a)}
                            className="flex-shrink-0 bg-white border-2 border-violet-200 text-violet-600 hover:bg-violet-50 font-bold px-3 py-1.5 rounded-xl text-xs shadow-sm transition-colors">
                            Pay separately
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>}
            </div>

            {/* ✂️ Getting pampered — compact pills */}
            {checkins.length > 0 && (
              <div className="bg-sky-50 rounded-xl border border-sky-100 px-4 py-3">
                <p className="text-xs font-bold text-sky-600 uppercase tracking-widest mb-2">✂️ Getting Pampered · {checkins.length}</p>
                <div className="flex flex-wrap gap-2">
                  {checkins.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 bg-white border border-sky-200 rounded-full px-3 py-1">
                      {a.pets?.photo_url
                        ? <img src={a.pets.photo_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                        : <span className="text-xs">🐶</span>}
                      <span className="text-sm font-bold text-gray-700">{a.pets?.name}</span>
                      <span className="text-xs text-gray-400">{fmt12(a.appointment_time)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ All done — Paid today at the bottom */}
            {paid.length > 0 && (
              <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-500 text-sm">✅ All Done · {paid.length} paid</h2>
                  <span className="text-xs text-gray-400">{fmtMoney(totalService + totalTips)} total</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                  {paid.map(a => {
                    const s = PM[a.payment_method ?? ''] ?? { bg: 'bg-gray-100', text: 'text-gray-500', icon: '💰', label: a.payment_method ?? '—', border: '' }
                    const tip = parseFloat(a.tip_amount || '0')
                    const svc = parseFloat(a.payment_amount || '0')
                    return (
                      <button key={a.id} onClick={() => setCheckoutAppt(a)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors text-left">
                        {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="" /> : <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-sm flex-shrink-0">🐶</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-600 truncate text-sm">{a.pets?.name} <span className="text-gray-400 font-normal text-xs">· {a.clients?.name}</span></p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-600 text-sm">{fmtMoney(svc + tip)}</p>
                          {tip > 0 && <p className="text-emerald-500 text-xs">+{fmtMoney(tip)} tip</p>}
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.icon}</span>
                        <span className="text-gray-300 text-xs flex-shrink-0">✏️</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHECK IN TAB ── */}
        {tab === 'checkin' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-gray-800">🐾 Upcoming</h2>
              <div className="flex gap-3 text-sm font-bold">
                <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full">Not here yet: {waitingCheckin.length}</span>
                <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-full">In Salon: {inSalon.length}</span>
              </div>
            </div>

            {/* Today's appointments waiting to check in */}
            {waitingCheckin.length > 0 ? (
              <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Upcoming — Not Checked In Yet</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {waitingCheckin.map(a => (
                    <div key={a.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                      {a.pets?.photo_url
                        ? <img src={a.pets.photo_url} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" alt="" />
                        : <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">🐶</div>}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-gray-800 text-lg">{a.pets?.name} <span className="text-gray-400 font-normal text-sm">· {a.clients?.name}</span></p>
                        <p className="text-gray-500 text-sm">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                        {staffList.length > 0 && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <select value={a.assigned_groomer || ''} disabled={assigningId === a.id}
                              onChange={e => assignStaff(a.id, e.target.value || null, a.assigned_bather)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none">
                              <option value="">✂️ Groomer</option>
                              {staffList.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
                            </select>
                            <select value={a.assigned_bather || ''} disabled={assigningId === a.id}
                              onChange={e => assignStaff(a.id, a.assigned_groomer, e.target.value || null)}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none">
                              <option value="">🛁 Bather</option>
                              {staffList.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${a.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.status === 'confirmed' ? '✓ Confirmed' : 'Pending'}
                      </span>
                      <button onClick={() => handleQuickCheckin(a)} disabled={checkinLoading === a.id}
                        className="flex-shrink-0 bg-sky-500 hover:bg-sky-600 text-white font-black px-5 py-2.5 rounded-2xl text-sm shadow transition-colors active:scale-95 disabled:opacity-50">
                        {checkinLoading === a.id ? '…' : '🐾 Check In'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow p-10 text-center">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-lg font-black text-gray-700">Everyone&apos;s here!</p>
                <p className="text-gray-400 mt-1">All of today&apos;s appointments have been checked in.</p>
              </div>
            )}

            {/* Already in salon — compact list */}
            {inSalon.length > 0 && (
              <div className="bg-sky-50 rounded-xl border border-sky-100 px-4 py-3">
                <p className="text-xs font-bold text-sky-600 uppercase tracking-widest mb-2">✂️ In the Salon · {inSalon.length}</p>
                <div className="flex flex-wrap gap-2">
                  {inSalon.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 bg-white border border-sky-200 rounded-full px-3 py-1">
                      {a.pets?.photo_url
                        ? <img src={a.pets.photo_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                        : <span className="text-xs">🐶</span>}
                      <span className="text-sm font-bold text-gray-700">{a.pets?.name}</span>
                      <span className="text-xs text-gray-400">{fmt12(a.appointment_time)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Phone search fallback */}
            <div className="border-t border-gray-200 pt-5">
              <p className="text-sm text-gray-400 font-medium mb-3">Walk-in or not on the list? Search by phone:</p>
              <PhoneSearch onDone={() => { fetchData(); setTab('dashboard') }} serviceLabels={serviceMap} />
            </div>
          </div>
        )}

        {/* ── CHECK OUT / PAYMENT TAB ── */}
        {tab === 'checkout' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-gray-800">💰 Ready to Go</h2>
              <div className="flex gap-3 items-center">
                <span className="bg-rose-100 text-rose-600 font-bold text-sm px-3 py-1 rounded-full">Unpaid: {unpaid.length}</span>
                <span className="bg-green-100 text-green-700 font-bold text-sm px-3 py-1 rounded-full">Cash waiting: {cashPending.length}</span>
                <span className="bg-emerald-100 text-emerald-700 font-bold text-sm px-3 py-1 rounded-full">Paid: {paid.length}</span>
                <button onClick={fetchData} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">⟳ Refresh</button>
              </div>
            </div>

            {/* Cash waiting customers */}
            {cashPending.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-green-700 uppercase tracking-widest">💵 Cash Customers Waiting at Front Desk</p>
                {cashPending.map(a => (
                  <div key={a.id} className="bg-green-50 rounded-2xl border-2 border-green-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-4 p-4">
                      {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" alt="" /> : <div className="w-16 h-16 rounded-2xl bg-green-200 flex items-center justify-center text-3xl flex-shrink-0">🐶</div>}
                      <div className="flex-1">
                        <p className="text-xl font-black text-gray-800">{a.pets?.name} <span className="text-gray-400 font-normal text-base">· {a.clients?.name}</span></p>
                        <p className="text-gray-500 text-sm">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                        {a.payment_amount && <p className="text-green-700 text-sm font-bold">{fmtMoney(a.payment_amount)} due — paying cash</p>}
                      </div>
                      <button onClick={() => setCheckoutAppt(a)}
                        className="bg-green-500 hover:bg-green-600 text-white font-black px-6 py-3 rounded-2xl text-base shadow transition-colors active:scale-95">
                        💵 Collect Cash
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unpaid.length === 0 && cashPending.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow p-12 text-center">
                <p className="text-5xl mb-3">🎉</p>
                <p className="text-xl font-black text-gray-700">All paid up!</p>
                <p className="text-gray-400 mt-1">No pending payments right now.</p>
              </div>
            ) : unpaid.length > 0 ? (
              <div className="space-y-3">
                {unpaidGroups.map(group => (
                  <div key={group[0].id} className={group.length > 1 ? 'bg-violet-50/50 border-2 border-violet-200 rounded-2xl p-3 space-y-2' : ''}>
                    {group.length > 1 && (
                      <div className="flex items-center justify-between px-1">
                        <p className="font-black text-violet-700">🐾 {group[0].clients?.name} · {group.length} pets</p>
                        <button onClick={() => setGroupCheckout(group)}
                          className="bg-violet-600 hover:bg-violet-700 text-white font-black px-5 py-2.5 rounded-2xl text-base shadow transition-colors active:scale-95">
                          💳 Pay all {group.length} together
                        </button>
                      </div>
                    )}
                    {group.map(a => (
                      <div key={a.id} className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-4 p-4">
                          {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" alt="" /> : <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-3xl flex-shrink-0">🐶</div>}
                          <div className="flex-1">
                            <p className="text-xl font-black text-gray-800">{a.pets?.name} <span className="text-gray-400 font-normal text-base">· {a.clients?.name}</span></p>
                            <p className="text-gray-500 text-sm">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                            {staffList.length > 0 ? (
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <select value={a.assigned_groomer || ''} disabled={assigningId === a.id}
                                  onChange={e => assignStaff(a.id, e.target.value || null, a.assigned_bather)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none">
                                  <option value="">✂️ Groomer</option>
                                  {staffList.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
                                </select>
                                <select value={a.assigned_bather || ''} disabled={assigningId === a.id}
                                  onChange={e => assignStaff(a.id, a.assigned_groomer, e.target.value || null)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none">
                                  <option value="">🛁 Bather</option>
                                  {staffList.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
                                </select>
                              </div>
                            ) : a.assigned_groomer ? (
                              <p className="text-gray-400 text-xs">✂️ {firstName(a.assigned_groomer)}</p>
                            ) : null}
                          </div>
                          <button onClick={() => setCheckoutAppt(a)}
                            className={`text-white font-black px-6 py-3 rounded-2xl text-base shadow transition-colors active:scale-95 ${group.length > 1 ? 'bg-white !text-violet-600 border-2 border-violet-300 hover:bg-violet-50' : 'bg-violet-600 hover:bg-violet-700'}`}>
                            {group.length > 1 ? 'Pay separately' : '💳 Checkout'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Already paid today */}
            {paid.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">✅ Paid Today · {fmtMoney(totalService + totalTips)}</p>
                <div className="bg-white rounded-2xl border border-gray-100 shadow overflow-hidden divide-y divide-gray-50">
                  {paid.map(a => {
                    const s = PM[a.payment_method ?? ''] ?? { bg: 'bg-gray-100', text: 'text-gray-500', icon: '💰', label: a.payment_method ?? '—', border: '' }
                    const tip = parseFloat(a.tip_amount || '0')
                    const svc = parseFloat(a.payment_amount || '0')
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                        {a.pets?.photo_url ? <img src={a.pets.photo_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" /> : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-800 text-sm truncate">{a.pets?.name} <span className="text-gray-400 font-normal">· {a.clients?.name}</span></p>
                          <p className="text-gray-400 text-xs">{serviceMap[a.service] ?? a.service} · {fmt12(a.appointment_time)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-emerald-600 text-sm">{fmtMoney(svc + tip)}</p>
                          {tip > 0 && <p className="text-emerald-400 text-xs">+{fmtMoney(tip)} tip</p>}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.icon} {s.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}


      </div>

      {/* Checkout modal */}
      {checkoutAppt && (
        <CheckoutModal
          appt={checkoutAppt}
          onClose={() => setCheckoutAppt(null)}
          onSuccess={(updated) => {
            handlePaymentSuccess(checkoutAppt.id, updated)
            setCheckoutAppt(null)
          }}
          serviceLabels={serviceMap}
        />
      )}
      {groupCheckout && groupCheckout.length > 0 && (
        <GroupCheckoutModal
          appts={groupCheckout}
          onClose={() => setGroupCheckout(null)}
          onSuccess={(updates) => {
            handleGroupPaymentSuccess(updates)
            setGroupCheckout(null)
          }}
          serviceLabels={serviceMap}
        />
      )}
    </div>
  )
}
