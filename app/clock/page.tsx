'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type StaffStatus = {
  id: string
  name: string
  role: string
  status: 'in' | 'on_break' | 'out'
  last_action: string | null
  last_punched_at: string | null
}

type PunchResult = {
  success: boolean
  error?: string
  staff?: { id: string; name: string; role: string }
  action?: 'clock_in' | 'clock_out' | 'break_start' | 'break_end'
  punched_at?: string
  currentStatus?: 'in' | 'on_break' | 'out'
}

function prettyAction(a: string | undefined) {
  if (a === 'clock_in') return 'Clocked In'
  if (a === 'clock_out') return 'Clocked Out'
  if (a === 'break_start') return 'Break Started'
  if (a === 'break_end') return 'Break Ended'
  return ''
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function elapsedSince(iso: string | null) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

export default function ClockKioskPage() {
  const [clock, setClock] = useState('')
  const [date, setDate] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; title: string; sub?: string } | null>(null)
  const [staffList, setStaffList] = useState<StaffStatus[]>([])
  const [mode, setMode] = useState<'auto' | 'break_start' | 'break_end'>('auto')

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }))
      setDate(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  // Poll status
  async function loadStatus() {
    try {
      const res = await fetch('/api/clock/status', { cache: 'no-store' })
      const json = await res.json()
      setStaffList(json.staff ?? [])
    } catch { /* ignore */ }
  }
  useEffect(() => {
    loadStatus()
    const iv = setInterval(loadStatus, 10000)
    return () => clearInterval(iv)
  }, [])

  // Auto-dismiss flash
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  async function submitPin(currentPin: string) {
    if (busy) return
    setBusy(true)
    try {
      const body: { pin: string; action?: string } = { pin: currentPin }
      if (mode === 'break_start') body.action = 'break_start'
      if (mode === 'break_end') body.action = 'break_end'
      const res = await fetch('/api/clock/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json: PunchResult = await res.json()
      if (json.success) {
        setFlash({
          kind: 'success',
          title: `${prettyAction(json.action)} — ${json.staff?.name ?? ''}`,
          sub: fmtTime(json.punched_at ?? null),
        })
      } else {
        setFlash({ kind: 'error', title: json.error || 'Error', sub: json.staff?.name })
      }
    } catch (e) {
      setFlash({ kind: 'error', title: (e as Error).message })
    } finally {
      setPin('')
      setMode('auto')
      setBusy(false)
      loadStatus()
    }
  }

  function keyPress(k: string) {
    if (busy) return
    if (k === 'clear') { setPin(''); return }
    if (k === 'back') { setPin(p => p.slice(0, -1)); return }
    if (k === 'enter') {
      if (pin.length >= 3) submitPin(pin)
      return
    }
    // digit
    const next = (pin + k).slice(0, 8)
    setPin(next)
    // Auto-submit at 4 digits for the snappy TimeStation feel
    if (next.length === 4) submitPin(next)
  }

  const inList = staffList.filter(s => s.status !== 'out')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-50 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Kokoni" width={44} height={44} className="rounded-full" />
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">Kokoni Time Clock</h1>
            <p className="text-xs text-gray-500">{date}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-gray-800 tabular-nums leading-none">{clock}</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 pb-6">
        {/* Left: PIN pad */}
        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-gray-100 p-6 flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Enter your PIN</h2>
          <p className="text-sm text-gray-500 mb-5">
            {mode === 'break_start' ? 'Starting break' : mode === 'break_end' ? 'Ending break' : 'Clock In / Out'}
          </p>

          {/* PIN display */}
          <div className="flex gap-3 mb-6 h-12 items-center">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <div
                key={i}
                className={`w-5 h-5 rounded-full border-2 ${i < pin.length ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {['1','2','3','4','5','6','7','8','9'].map(n => (
              <button
                key={n}
                onClick={() => keyPress(n)}
                className="h-16 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-2xl text-3xl font-semibold text-gray-800 transition-colors"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => keyPress('clear')}
              className="h-16 bg-gray-50 hover:bg-gray-100 rounded-2xl text-sm font-semibold text-gray-500"
            >
              Clear
            </button>
            <button
              onClick={() => keyPress('0')}
              className="h-16 bg-gray-50 hover:bg-gray-100 rounded-2xl text-3xl font-semibold text-gray-800"
            >
              0
            </button>
            <button
              onClick={() => keyPress('back')}
              className="h-16 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500"
              aria-label="Backspace"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
          </div>

          {/* Mode toggles */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setMode('auto')}
              className={`px-4 py-2 rounded-full text-sm font-semibold ${mode === 'auto' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode('break_start')}
              className={`px-4 py-2 rounded-full text-sm font-semibold ${mode === 'break_start' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              ☕ Start Break
            </button>
            <button
              onClick={() => setMode('break_end')}
              className={`px-4 py-2 rounded-full text-sm font-semibold ${mode === 'break_end' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              ▶ End Break
            </button>
          </div>

          <p className="mt-4 text-[11px] text-gray-400 text-center max-w-xs">
            &quot;Auto&quot; clocks you in if out, out if in. Use the break buttons to go on/off break.
          </p>
        </div>

        {/* Right: Who's in */}
        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-gray-100 p-6 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Currently In</h2>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {inList.length} {inList.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {inList.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Nobody is clocked in.</div>
            ) : (
              inList.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${s.status === 'in' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    {s.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 truncate">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.status === 'in' ? '🟢 Working' : '☕ On Break'} · since {fmtTime(s.last_punched_at)} ({elapsedSince(s.last_punched_at)})
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-3 text-[11px] text-gray-400 text-center">Auto-refreshes every 10s.</p>
        </div>
      </div>

      {/* Flash notification */}
      {flash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`pointer-events-auto rounded-3xl shadow-2xl px-8 py-6 text-center max-w-md ${flash.kind === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            <div className="text-4xl mb-2">{flash.kind === 'success' ? '✓' : '✗'}</div>
            <div className="text-xl font-bold">{flash.title}</div>
            {flash.sub && <div className="text-sm opacity-90 mt-1">{flash.sub}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
