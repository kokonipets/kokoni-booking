'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type DayRow = { date: string; work_minutes: number; break_minutes: number }
type StaffReport = {
  staff_id: string
  name: string
  role: string
  hourly_rate: number | null
  pay_type: string | null
  total_minutes: number
  total_hours: number
  days: DayRow[]
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
function fmtHM(mins: number) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
function fmtDateShort(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}

export default function TimesheetPage() {
  const [from, setFrom] = useState(mondayOf(todayISO()))
  const [to, setTo] = useState(addDays(mondayOf(todayISO()), 6))
  const [report, setReport] = useState<StaffReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/timesheet?from=${from}&to=${to}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setReport(json.report ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    if (!report[0]) return [] as string[]
    return report[0].days.map(d => d.date)
  }, [report])

  const grandTotalMinutes = report.reduce((s, r) => s + r.total_minutes, 0)

  function setThisWeek() {
    const mon = mondayOf(todayISO())
    setFrom(mon); setTo(addDays(mon, 6))
  }
  function setLastWeek() {
    const mon = addDays(mondayOf(todayISO()), -7)
    setFrom(mon); setTo(addDays(mon, 6))
  }
  function setThisPayPeriod() {
    // Assume bi-weekly: anchor on first Monday of month
    const today = todayISO()
    const d = new Date(`${today}T00:00:00Z`)
    const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const firstMondayDow = firstOfMonth.getUTCDay()
    const firstMondayOffset = firstMondayDow === 0 ? 1 : (firstMondayDow === 1 ? 0 : 8 - firstMondayDow)
    const firstMonday = new Date(firstOfMonth)
    firstMonday.setUTCDate(firstMonday.getUTCDate() + firstMondayOffset)
    const sinceFirstMonday = Math.floor((d.getTime() - firstMonday.getTime()) / (7 * 86400000))
    const periodIndex = Math.floor(sinceFirstMonday / 2)
    const start = new Date(firstMonday)
    start.setUTCDate(start.getUTCDate() + periodIndex * 14)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 13)
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }

  function exportCSV() {
    const rows: string[][] = []
    rows.push(['Staff', 'Role', ...days.map(fmtDateShort), 'Total Hours'])
    for (const r of report) {
      const row = [r.name, r.role, ...r.days.map(d => (d.work_minutes / 60).toFixed(2)), r.total_hours.toFixed(2)]
      rows.push(row)
    }
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheet_${from}_to_${to}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/desk" className="text-sm text-sky-600 hover:text-sky-700">← Dashboard</Link>
            <h1 className="text-2xl font-bold text-gray-800 mt-1">Timesheet</h1>
            <p className="text-sm text-gray-500">Hours worked per staff. Break time is subtracted.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/clock" className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg" target="_blank">Open Kiosk ↗</Link>
            <button onClick={exportCSV} className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold rounded-lg">Export CSV</button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={setThisWeek} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">This Week</button>
            <button onClick={setLastWeek} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">Last Week</button>
            <button onClick={setThisPayPeriod} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">This Pay Period</button>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            Grand total: <span className="font-bold text-gray-800">{fmtHM(grandTotalMinutes)}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="p-10 text-center text-sm text-rose-600">{error}</div>
          ) : report.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No staff found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-semibold">Staff</th>
                  {days.map(d => (
                    <th key={d} className="text-center px-3 py-3 font-semibold">{fmtDateShort(d)}</th>
                  ))}
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.map(r => (
                  <tr key={r.staff_id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-400 capitalize">{r.role}</div>
                    </td>
                    {r.days.map(d => (
                      <td key={d.date} className="text-center px-3 py-3 text-gray-700 tabular-nums">
                        {d.work_minutes > 0 ? (
                          <div>
                            <div>{(d.work_minutes / 60).toFixed(2)}h</div>
                            {d.break_minutes > 0 && (
                              <div className="text-[10px] text-gray-400">br {fmtHM(d.break_minutes)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="text-right px-4 py-3 font-bold text-gray-900 tabular-nums">
                      {r.total_hours.toFixed(2)}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Kiosk URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded">/clock</code> · Staff need a PIN set in their profile to use it.
        </p>
      </div>
    </div>
  )
}
