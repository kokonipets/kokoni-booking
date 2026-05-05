'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
// Note: using plain <img> for pet photos — they're external Supabase URLs not in next.config remotePatterns

type Pet = { name: string; breed: string; photo_url?: string | null }
type Client = { name: string; phone: string }
type Appt = {
  id: string
  appointment_time: string
  appointment_date: string
  service: string
  status: string
  grooming_status: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  payment_status: string | null
  payment_amount: string | null
  payment_method: string | null
  tip_amount: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  pets: Pet | null
  clients: Client | null
}

const SERVICE_LABELS: Record<string, string> = {
  bath_brush: 'Bath & Brush', full_groom: 'Full Groom', nail_trim: 'Nail Trim',
  teeth_brushing: 'Teeth Brushing', ear_cleaning: 'Ear Cleaning', deshedding: 'Deshedding',
  asian_fusion: 'Asian Fusion', puppy_first: 'Puppy First Groom',
}

function formatTime(t: string) {
  // Already in 12-hour format (e.g. "9:00 AM") — return as-is
  if (/[AP]M/i.test(t)) return t.trim()
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

type CardStatus = 'arriving' | 'waiting' | 'grooming' | 'ready' | 'done'

function getCardStatus(a: Appt): CardStatus {
  if (a.status === 'completed' || a.grooming_status === 'done') return 'done'
  if (a.grooming_status === 'ready') return 'ready'
  if (a.grooming_status === 'incare' || a.grooming_status === 'in_progress') return 'grooming'
  if (a.grooming_status === 'waiting') return 'waiting'
  return 'arriving'
}

const STATUS_CONFIG: Record<CardStatus, {
  label: string; sectionLabel: string
  cardBg: string; cardBorder: string
  badgeBg: string; badgeText: string; badgeBorder: string
  sectionDot: string
}> = {
  arriving: {
    label: 'Scheduled', sectionLabel: 'Scheduled',
    cardBg: 'bg-white', cardBorder: 'border-gray-200',
    badgeBg: 'bg-blue-50', badgeText: 'text-blue-600', badgeBorder: 'border-blue-100',
    sectionDot: 'bg-blue-400',
  },
  waiting: {
    label: 'Checked In', sectionLabel: 'Checked In — Waiting',
    cardBg: 'bg-white', cardBorder: 'border-amber-300',
    badgeBg: 'bg-amber-50', badgeText: 'text-amber-600', badgeBorder: 'border-amber-200',
    sectionDot: 'bg-amber-400',
  },
  grooming: {
    label: 'Grooming', sectionLabel: 'Currently Grooming',
    cardBg: 'bg-white', cardBorder: 'border-purple-300',
    badgeBg: 'bg-purple-50', badgeText: 'text-purple-600', badgeBorder: 'border-purple-200',
    sectionDot: 'bg-purple-400',
  },
  ready: {
    label: 'Ready for Pickup', sectionLabel: 'Ready for Pickup 🎉',
    cardBg: 'bg-white', cardBorder: 'border-emerald-400',
    badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', badgeBorder: 'border-emerald-200',
    sectionDot: 'bg-emerald-400',
  },
  done: {
    label: 'Checked Out', sectionLabel: 'Checked Out',
    cardBg: 'bg-gray-50', cardBorder: 'border-gray-200',
    badgeBg: 'bg-gray-100', badgeText: 'text-gray-400', badgeBorder: 'border-gray-200',
    sectionDot: 'bg-gray-300',
  },
}

export default function StaffCheckinPage() {
  const [appts, setAppts] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [staffList, setStaffList] = useState<string[]>([])
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }

  // Cash checkout popup
  const [cashAlert, setCashAlert] = useState<Appt | null>(null)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [cashReceived, setCashReceived] = useState('')
  const seenCashIds = useRef<Set<string>>(new Set())

  // Venmo / Zelle checkout popup
  const [venmoZelleAlert, setVenmoZelleAlert] = useState<Appt | null>(null)
  const [confirmingVenmoZelle, setConfirmingVenmoZelle] = useState(false)
  const seenVZIds = useRef<Set<string>>(new Set())

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAppts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/appointments?status=today')
      const data = await res.json()
      const fresh: Appt[] = data.appointments || []
      setAppts(fresh)
      setLastRefresh(new Date())

      // Detect newly cash-pending appointments → pop alert
      for (const a of fresh.filter(a => a.payment_status === 'cash_pending')) {
        if (!seenCashIds.current.has(a.id)) {
          seenCashIds.current.add(a.id)
          setCashReceived('')
          setCashAlert(a)
        }
      }

      // Detect newly venmo/zelle-pending → pop alert
      for (const a of fresh.filter(a => a.payment_status === 'venmo_pending' || a.payment_status === 'zelle_pending')) {
        if (!seenVZIds.current.has(a.id)) {
          seenVZIds.current.add(a.id)
          setVenmoZelleAlert(a)
        }
      }

      // Clear seen IDs once paid so re-triggers work if needed
      for (const id of Array.from(seenCashIds.current)) {
        const appt = fresh.find(a => a.id === id)
        if (!appt || appt.payment_status === 'paid') seenCashIds.current.delete(id)
      }
      for (const id of Array.from(seenVZIds.current)) {
        const appt = fresh.find(a => a.id === id)
        if (!appt || appt.payment_status === 'paid') seenVZIds.current.delete(id)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchAppts()
    // Poll every 8s so cash popup appears within seconds of customer acting at kiosk
    const id = setInterval(fetchAppts, 8000)
    // Load staff list
    fetch('/api/admin/staff').then(r => r.json()).then(d => {
      setStaffList((d.staff ?? []).map((s: { name: string }) => s.name).filter(Boolean))
    }).catch(() => {})
    // Load services so dynamic service names display correctly
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { const all = JSON.parse(svcVal); setServiceDefs(all.filter((s: { visible?: unknown }) => s.visible !== false && s.visible !== 'false' && s.visible !== 0)) } catch { /* ignore */ } }
    }).catch(() => {})
    return () => clearInterval(id)
  }, [fetchAppts])

  const assignStaff = async (apptId: string, groomer: string | null, bather: string | null) => {
    setAssigningId(apptId)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign-staff', assigned_groomer: groomer, assigned_bather: bather }),
      })
      if (res.ok) {
        setAppts(prev => prev.map(a => a.id === apptId
          ? { ...a, assigned_groomer: groomer, assigned_bather: bather }
          : a
        ))
      }
    } catch { /* silent */ }
    finally { setAssigningId(null) }
  }

  const confirmCashPayment = async (appt: Appt, tipFromCash: number | null) => {
    setConfirmingPayment(true)
    try {
      const body: Record<string, string | null> = {
        action: 'record-payment',
        payment_status: 'paid',
        payment_method: 'cash',
      }
      // If tip was calculated from cash received, save it
      if (tipFromCash !== null && tipFromCash > 0) {
        body.tip_amount = tipFromCash.toFixed(2)
      }
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setCashAlert(null)
        setCashReceived('')
        showToast(`✅ ${appt.pets?.name || 'Payment'} — cash collected!`)
        await fetchAppts()
      } else {
        showToast('Could not mark paid. Try again.', false)
      }
    } catch { showToast('Connection error. Try again.', false) }
    finally { setConfirmingPayment(false) }
  }

  const confirmVenmoZellePayment = async (appt: Appt) => {
    setConfirmingVenmoZelle(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record-payment',
          payment_status: 'paid',
          payment_method: appt.payment_method, // keeps 'venmo' or 'zelle'
        }),
      })
      if (res.ok) {
        setVenmoZelleAlert(null)
        const methodLabel = appt.payment_method === 'venmo' ? 'Venmo' : 'Zelle'
        showToast(`✅ ${appt.pets?.name || 'Payment'} — ${methodLabel} confirmed!`)
        await fetchAppts()
      } else {
        showToast('Could not mark paid. Try again.', false)
      }
    } catch { showToast('Connection error. Try again.', false) }
    finally { setConfirmingVenmoZelle(false) }
  }

  const doAction = async (apptId: string, action: 'checkin' | 'checkout') => {
    setActionLoading(apptId + action)
    try {
      const res = await fetch('/api/kiosk/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, appointmentId: apptId }),
      })
      if (!res.ok) throw new Error()
      showToast(action === 'checkin' ? '✅ Checked in!' : '👋 Checked out!')
      await fetchAppts()
    } catch { showToast('Something went wrong. Try again.', false) }
    finally { setActionLoading(null) }
  }

  const order: CardStatus[] = ['arriving', 'waiting', 'grooming', 'ready', 'done']
  const grouped = order.reduce((acc, s) => {
    acc[s] = appts.filter(a => getCardStatus(a) === s)
    return acc
  }, {} as Record<CardStatus, Appt[]>)

  const activeCount = appts.filter(a => getCardStatus(a) !== 'done').length

  return (
    <div className="min-h-screen bg-white">

      {/* ── CASH CHECKOUT POPUP ─────────────────────────────────────────────── */}
      {cashAlert && (() => {
        const serviceCost = parseFloat(cashAlert.payment_amount || '0')
        const kioskTip   = parseFloat(cashAlert.tip_amount || '0')
        const totalDue   = serviceCost + kioskTip
        const given      = parseFloat(cashReceived)
        const validGiven = !isNaN(given) && given > 0
        // Tip = cash given minus total due (service + kiosk tip); change = 0 in that case
        // If short of total but covers service, show shortfall and save no tip
        const netAboveTotal = validGiven ? +(given - totalDue).toFixed(2) : 0
        const tipFromCash   = netAboveTotal > 0 ? netAboveTotal : 0
        const shortfall     = validGiven && given < totalDue ? +(totalDue - given).toFixed(2) : 0
        const exactOrOver   = validGiven && given >= totalDue
        const canConfirm    = validGiven && given >= serviceCost

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

              {/* Green header — pet info */}
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 flex items-center gap-4">
                {cashAlert.pets?.photo_url
                  ? <img src={cashAlert.pets.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                  : <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">🐶</div>
                }
                <div className="text-white min-w-0">
                  <p className="text-2xl font-black leading-tight">{cashAlert.pets?.name || '—'}</p>
                  <p className="text-sm font-medium opacity-90">{cashAlert.clients?.name || 'Unknown owner'}</p>
                  <p className="text-sm opacity-75">{cashAlert.clients?.phone} · {formatTime(cashAlert.appointment_time)}</p>
                </div>
              </div>

              {/* Bill breakdown */}
              <div className="px-6 pt-5 pb-3 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{serviceMap[cashAlert.service] || cashAlert.service}</span>
                  <span className="font-semibold text-gray-800">${serviceCost.toFixed(2)}</span>
                </div>
                {kioskTip > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Tip (selected at kiosk)</span>
                    <span className="font-semibold text-emerald-600">+${kioskTip.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-100 pt-2">
                  <span>Total Due</span>
                  <span>${totalDue.toFixed(2)}</span>
                </div>
              </div>

              {/* Cash received input */}
              <div className="px-6 pb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                  💵 Cash Received
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    autoFocus
                    className="w-full pl-10 pr-4 py-4 text-3xl font-black text-gray-900 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-emerald-400 bg-gray-50"
                  />
                </div>

                {/* Live math */}
                {validGiven && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-gray-100">
                    {tipFromCash > 0 && (
                      <div className="flex justify-between px-4 py-2.5 bg-emerald-50">
                        <span className="text-sm font-semibold text-emerald-700">💚 Tip included</span>
                        <span className="text-sm font-black text-emerald-700">+${tipFromCash.toFixed(2)}</span>
                      </div>
                    )}
                    {exactOrOver && tipFromCash === 0 && (
                      <div className="flex justify-between px-4 py-2.5 bg-gray-50">
                        <span className="text-sm font-semibold text-gray-500">✓ Exact — no change</span>
                      </div>
                    )}
                    {shortfall > 0 && (
                      <div className="flex justify-between px-4 py-2.5 bg-red-50">
                        <span className="text-sm font-semibold text-red-600">⚠️ Short by</span>
                        <span className="text-sm font-black text-red-600">${shortfall.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => { setCashAlert(null); setCashReceived('') }}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={() => confirmCashPayment(cashAlert, tipFromCash)}
                  disabled={!canConfirm || confirmingPayment}
                  className="flex-[2] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base shadow-lg shadow-emerald-200 disabled:opacity-40 transition-all active:scale-95"
                >
                  {confirmingPayment ? 'Saving…' : '✓ Collected — Mark Paid'}
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* ── VENMO / ZELLE CHECKOUT POPUP ──────────────────────────────────────── */}
      {venmoZelleAlert && (() => {
        const isVenmo = venmoZelleAlert.payment_method === 'venmo'
        const serviceCost = parseFloat(venmoZelleAlert.payment_amount || '0')
        const kioskTip   = parseFloat(venmoZelleAlert.tip_amount || '0')
        const totalDue   = serviceCost + kioskTip

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

              {/* Branded header */}
              <div className={`px-6 py-5 flex items-center gap-4 ${isVenmo ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-gradient-to-r from-yellow-400 to-amber-500'}`}>
                {venmoZelleAlert.pets?.photo_url
                  ? <img src={venmoZelleAlert.pets.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                  : <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">🐶</div>
                }
                <div className="text-white min-w-0">
                  <p className="text-2xl font-black leading-tight">{venmoZelleAlert.pets?.name || '—'}</p>
                  <p className="text-sm font-medium opacity-90">{venmoZelleAlert.clients?.name || 'Unknown owner'}</p>
                  <p className="text-sm opacity-75">{venmoZelleAlert.clients?.phone} · {formatTime(venmoZelleAlert.appointment_time)}</p>
                </div>
                <div className="ml-auto text-4xl">{isVenmo ? '💜' : '💛'}</div>
              </div>

              {/* Payment details */}
              <div className="px-6 pt-5 pb-4">
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isVenmo ? 'text-indigo-500' : 'text-amber-500'}`}>
                  {isVenmo ? 'Venmo' : 'Zelle'} Payment — Please Verify
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{serviceMap[venmoZelleAlert.service] || venmoZelleAlert.service}</span>
                    <span className="font-semibold text-gray-800">${serviceCost.toFixed(2)}</span>
                  </div>
                  {kioskTip > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Tip</span>
                      <span className={`font-semibold ${isVenmo ? 'text-indigo-600' : 'text-amber-600'}`}>+${kioskTip.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between text-xl font-black border-t border-gray-100 pt-3 ${isVenmo ? 'text-indigo-700' : 'text-amber-700'}`}>
                    <span>Total</span>
                    <span>${totalDue.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Check your {isVenmo ? 'Venmo' : 'Zelle'} app to confirm the payment was received before marking paid.
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => { setVenmoZelleAlert(null) }}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={() => confirmVenmoZellePayment(venmoZelleAlert)}
                  disabled={confirmingVenmoZelle}
                  className={`flex-[2] py-3 rounded-2xl text-white font-black text-base shadow-lg disabled:opacity-40 transition-all active:scale-95 ${isVenmo ? 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-200' : 'bg-amber-400 hover:bg-amber-500 shadow-amber-200'}`}
                >
                  {confirmingVenmoZelle ? 'Saving…' : `✓ Verified — Mark Paid`}
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/front-desk" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors">
            ← Back
          </a>
          <div className="w-px h-5 bg-gray-200" />
          <img src="/logo.png" alt="Kokoni" className="w-8 h-8 rounded-full object-contain" />
          <h1 className="font-bold text-gray-900 text-xl">Check In / Check Out</h1>
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              {activeCount} active
            </span>
          )}
          <button
            onClick={fetchAppts}
            className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            ↻ Refresh
          </button>
          <span className="text-xs text-gray-300 hidden sm:block">
            Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-2xl transition-all ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <div className="w-9 h-9 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading today&apos;s appointments…</p>
          </div>
        ) : appts.length === 0 ? (
          <div className="text-center py-32">
            <p className="text-6xl mb-4">🐾</p>
            <p className="text-gray-500 font-semibold text-lg">No appointments today</p>
            <p className="text-gray-300 text-sm mt-1">Check back later</p>
          </div>
        ) : (
          <div className="space-y-8">
            {order.map(status => {
              const list = grouped[status]
              if (list.length === 0) return null
              const cfg = STATUS_CONFIG[status]
              const isDone = status === 'done'

              return (
                <section key={status}>
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.sectionDot}`} />
                    <h2 className="text-sm font-bold text-gray-600">{cfg.sectionLabel}</h2>
                    <span className="text-xs text-gray-300 font-semibold ml-1">{list.length}</span>
                  </div>

                  <div className="space-y-3">
                    {list.map(appt => {
                      const cardStatus = getCardStatus(appt)
                      const pet = appt.pets
                      const client = appt.clients
                      const isCheckinLoading = actionLoading === appt.id + 'checkin'
                      const isCheckoutLoading = actionLoading === appt.id + 'checkout'
                      const anyLoading = isCheckinLoading || isCheckoutLoading

                      return (
                        <div
                          key={appt.id}
                          className={`rounded-2xl border-2 ${cfg.cardBg} ${cfg.cardBorder} p-4 flex items-center gap-4 shadow-sm ${isDone ? 'opacity-60' : ''}`}
                        >
                          {/* Pet photo */}
                          <div className="shrink-0">
                            {pet?.photo_url
                              ? <img src={pet.photo_url} alt={pet.name || ''} className="w-14 h-14 rounded-xl object-cover" />
                              : (
                                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-3xl">
                                  🐶
                                </div>
                              )
                            }
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-bold text-gray-900 text-lg leading-tight">{pet?.name || '—'}</span>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 font-medium truncate">{client?.name || 'Unknown owner'}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-sm font-bold text-gray-700">{formatTime(appt.appointment_time)}</span>
                              <span className="text-gray-200">·</span>
                              <span className="text-sm text-gray-400">{serviceMap[appt.service] || appt.service}</span>
                              {appt.checked_in_at && cardStatus !== 'arriving' && (
                                <>
                                  <span className="text-gray-200">·</span>
                                  <span className="text-sm text-emerald-600 font-semibold">
                                    In {new Date(appt.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* Staff assignment */}
                            {cardStatus !== 'done' && staffList.length > 0 && (
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <select
                                  value={appt.assigned_groomer || ''}
                                  disabled={assigningId === appt.id}
                                  onChange={e => assignStaff(appt.id, e.target.value || null, appt.assigned_bather)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                                >
                                  <option value="">✂️ Groomer</option>
                                  {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select
                                  value={appt.assigned_bather || ''}
                                  disabled={assigningId === appt.id}
                                  onChange={e => assignStaff(appt.id, appt.assigned_groomer, e.target.value || null)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                                >
                                  <option value="">🛁 Bather</option>
                                  {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Action */}
                          <div className="shrink-0 flex flex-col gap-1.5 items-end">
                            {/* Manual cash collect — shown whenever payment_status is cash_pending */}
                            {appt.payment_status === 'cash_pending' && (
                              <button
                                onClick={() => { setCashReceived(''); setCashAlert(appt) }}
                                className="bg-green-500 hover:bg-green-600 active:scale-95 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-sm animate-pulse"
                              >
                                💵 Collect
                              </button>
                            )}
                            {(appt.payment_status === 'venmo_pending' || appt.payment_status === 'zelle_pending') && (
                              <button
                                onClick={() => setVenmoZelleAlert(appt)}
                                className="bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-sm animate-pulse"
                              >
                                {appt.payment_status === 'venmo_pending' ? '💜 Venmo' : '💛 Zelle'}
                              </button>
                            )}
                            {appt.payment_status !== 'cash_pending' && appt.payment_status !== 'venmo_pending' && appt.payment_status !== 'zelle_pending' && (<>
                              {cardStatus === 'arriving' && (
                                <button
                                  onClick={() => doAction(appt.id, 'checkin')}
                                  disabled={anyLoading}
                                  className="bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-40 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                                >
                                  {isCheckinLoading ? '…' : 'Check In'}
                                </button>
                              )}
                              {cardStatus === 'ready' && (
                                <button
                                  onClick={() => doAction(appt.id, 'checkout')}
                                  disabled={anyLoading}
                                  className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                                >
                                  {isCheckoutLoading ? '…' : 'Check Out'}
                                </button>
                              )}
                              {cardStatus === 'waiting' && (
                                <span className="text-sm text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl">
                                  With groomer
                                </span>
                              )}
                              {cardStatus === 'grooming' && (
                                <span className="text-sm text-purple-600 font-semibold bg-purple-50 border border-purple-200 px-4 py-2 rounded-xl">
                                  ✂️ Grooming
                                </span>
                              )}
                              {cardStatus === 'done' && (
                                <span className="text-sm text-gray-400 font-semibold px-3 py-2 rounded-xl">
                                  ✓ Done
                                </span>
                              )}
                            </>)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
