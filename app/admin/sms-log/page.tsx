'use client'
import { useEffect, useState } from 'react'

type SmsRow = {
  id: string
  created_at: string
  mode: 'live' | 'test' | 'off'
  status: 'sent' | 'suppressed' | 'failed' | 'redirected'
  to_number: string
  actual_to: string | null
  body: string
  template: string | null
  twilio_sid: string | null
  error: string | null
  suppressed_reason: string | null
}

const STATUS_STYLES: Record<string, string> = {
  sent:        'bg-emerald-100 text-emerald-800 border-emerald-200',
  redirected:  'bg-amber-100 text-amber-800 border-amber-200',
  suppressed:  'bg-gray-200 text-gray-700 border-gray-300',
  failed:      'bg-rose-100 text-rose-800 border-rose-200',
}

const MODE_STYLES: Record<string, string> = {
  live: 'bg-emerald-600 text-white',
  test: 'bg-amber-500 text-white',
  off:  'bg-gray-600 text-white',
}

export default function SmsLogPage() {
  const [logs, setLogs] = useState<SmsRow[]>([])
  const [mode, setMode] = useState<string>('')
  const [whitelist, setWhitelist] = useState<string[]>([])
  const [forward, setForward] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const q = filter ? `?status=${filter}` : ''
    const res = await fetch(`/api/admin/sms-log${q}`)
    const d = await res.json()
    if (d.success) {
      setLogs(d.logs)
      setMode(d.mode)
      setWhitelist(d.whitelist)
      setForward(d.forward)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">📱 SMS Log</h1>
        <button onClick={load} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm">Refresh</button>
      </div>

      {/* Mode banner */}
      <div className={`rounded-xl p-4 mb-4 border ${mode === 'live' ? 'bg-emerald-50 border-emerald-200' : mode === 'test' ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-300'}`}>
        <div className="flex items-center gap-3 mb-1">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${MODE_STYLES[mode] ?? ''}`}>
            {mode.toUpperCase()}
          </span>
          <span className="text-sm font-semibold">
            {mode === 'live' && 'SMS is LIVE — real customers receive texts'}
            {mode === 'test' && 'SMS TEST MODE — only whitelisted numbers receive texts'}
            {mode === 'off'  && 'SMS is OFF — nothing is sent, only logged'}
          </span>
        </div>
        {mode === 'test' && (
          <div className="text-xs text-gray-700 space-y-0.5 mt-1">
            {forward
              ? <div>↪ All messages redirected to: <code className="bg-white px-1 rounded">{forward}</code></div>
              : <div>Whitelist: {whitelist.length ? whitelist.map(n => <code key={n} className="bg-white px-1 rounded mr-1">{n}</code>) : <em>empty — nothing sends</em>}</div>
            }
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2">
          Change mode via <code>SMS_MODE</code> env (<code>live</code> | <code>test</code> | <code>off</code>). Whitelist via <code>SMS_TEST_WHITELIST</code>. Redirect via <code>SMS_TEST_FORWARD</code>.
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-3 text-sm">
        {['', 'sent', 'redirected', 'suppressed', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg border ${filter === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}
      {!loading && logs.length === 0 && <div className="text-gray-500">No messages logged yet.</div>}

      <div className="space-y-2">
        {logs.map(row => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${STATUS_STYLES[row.status]}`}>
                {row.status}
              </span>
              <span className="text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</span>
              {row.template && <span className="text-xs text-gray-400">· {row.template}</span>}
              <span className="ml-auto text-xs text-gray-500">
                → <code>{row.to_number}</code>
                {row.actual_to && row.actual_to !== row.to_number && <> (sent to <code>{row.actual_to}</code>)</>}
              </span>
            </div>
            <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800">{row.body}</pre>
            {row.error && <div className="mt-1 text-xs text-rose-700">Error: {row.error}</div>}
            {row.suppressed_reason && <div className="mt-1 text-xs text-gray-500">Suppressed: {row.suppressed_reason}</div>}
            {row.twilio_sid && <div className="mt-1 text-[10px] text-gray-400 font-mono">{row.twilio_sid}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
