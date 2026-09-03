'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdminGuard } from '@/lib/useAdminGuard'

type CashierLogin = { id: string; staff_name: string; logged_in_at: string }
type RangeKey = 'today' | 'week' | 'month' | 'all'

const SALON_TZ = 'America/Los_Angeles'
// Salon-local calendar date, not UTC — matches the same fix Timesheet needed
// so "Today" doesn't roll over early because the server runs in UTC.
function todayISO() { return new Date().toLocaleDateString('en-CA', { timeZone: SALON_TZ }) }
function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
function localDateKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: SALON_TZ })
}
function fmtDateShort(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: SALON_TZ })
}

export default function CashierLoginsPage() {
  const guardReady = useAdminGuard('cashier_logins')
  const [range, setRange] = useState<RangeKey>('week')
  const [logins, setLogins] = useState<CashierLogin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cashier/login', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setLogins(json.logins ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const { from, to } = useMemo(() => {
    const today = todayISO()
    if (range === 'today') return { from: today, to: today }
    if (range === 'week') return { from: mondayOf(today), to: today }
    if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
    return { from: '', to: '' } // 'all'
  }, [range])

  const filtered = useMemo(() => {
    if (range === 'all') return logins
    return logins.filter(l => {
      const key = localDateKey(l.logged_in_at)
      return key >= from && key <= to
    })
  }, [logins, from, to, range])

  function exportCSV() {
    const rows: string[][] = [['Staff', 'Date', 'Time']]
    for (const l of filtered) {
      rows.push([l.staff_name, fmtDateShort(localDateKey(l.logged_in_at)), fmtTime(l.logged_in_at)])
    }
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cashier_signins_${range}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!guardReady) return <div className="min-h-screen bg-gray-50" />

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/desk" className="text-sm text-sky-600 hover:text-sky-700">← Dashboard</Link>
            <h1 className="text-2xl font-bold text-gray-800 mt-1">Cashier Sign-Ins</h1>
            <p className="text-sm text-gray-500">Every time a staff member has signed into the Cashier checkout screen.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg">⟳ Refresh</button>
            <button onClick={exportCSV} className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold rounded-lg">Export CSV</button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <button onClick={() => setRange('today')} className={`px-3 py-2 rounded-lg text-sm ${range === 'today' ? 'bg-sky-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Today</button>
            <button onClick={() => setRange('week')} className={`px-3 py-2 rounded-lg text-sm ${range === 'week' ? 'bg-sky-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>This Week</button>
            <button onClick={() => setRange('month')} className={`px-3 py-2 rounded-lg text-sm ${range === 'month' ? 'bg-sky-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>This Month</button>
            <button onClick={() => setRange('all')} className={`px-3 py-2 rounded-lg text-sm ${range === 'all' ? 'bg-sky-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>All Time</button>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            <span className="font-bold text-gray-800">{filtered.length}</span> sign-in{filtered.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="p-10 text-center text-sm text-rose-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No sign-ins in this range.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-semibold">Staff</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-right px-4 py-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-semibold text-gray-800">🔑 {l.staff_name}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDateShort(localDateKey(l.logged_in_at))}</td>
                    <td className="text-right px-4 py-3 text-gray-700 tabular-nums">{fmtTime(l.logged_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
