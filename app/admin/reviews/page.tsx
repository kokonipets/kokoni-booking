'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAdminGuard } from '@/lib/useAdminGuard'

// Review requests are a single "how's your pup + please review us" text — no rating reply,
// so this page just records who it was sent to and when.
type Review = {
  id: string
  client_name: string | null
  client_phone: string
  review_request_sent_at: string | null
  created_at: string
}

type Period = 'today' | 'week' | 'month' | 'all'

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (t.length === 10) return `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}`
  return phone
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ReviewsPage() {
  const guardReady = useAdminGuard('reviews')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')
  // Send modal
  const [showSend, setShowSend] = useState(false)
  const [sendPhone, setSendPhone] = useState('')
  const [sendName, setSendName] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success?: boolean; error?: string } | null>(null)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reviews/list?limit=500')
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  const visible = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(startOfToday.getTime() - 6 * 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const from = period === 'today' ? startOfToday : period === 'week' ? weekAgo : period === 'month' ? monthStart : null
    return reviews
      .filter(r => r.review_request_sent_at)
      .filter(r => !from || new Date(r.review_request_sent_at as string) >= from)
      .sort((a, b) => (b.review_request_sent_at as string).localeCompare(a.review_request_sent_at as string))
  }, [reviews, period])

  const handleSend = async () => {
    if (sendPhone.length < 10) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/reviews/manual-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPhone: sendPhone, clientName: sendName, test: true }),
      })
      const data = await res.json()
      setSendResult(data)
      if (data.success) {
        setSendPhone('')
        setSendName('')
        setTimeout(() => { setShowSend(false); setSendResult(null) }, 1500)
      }
    } catch { setSendResult({ error: 'Network error' }) }
    setSending(false)
  }

  const formatPhoneInput = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }

  if (!guardReady) return <div className="min-h-screen bg-gray-50" />

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-800">⭐ Review Requests Sent</h1>
            <p className="text-sm text-gray-500 mt-0.5">Who we sent the review text to, and when</p>
          </div>
          <button
            onClick={() => { setShowSend(true); setSendResult(null) }}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            Send Test Message
          </button>
        </div>

        {/* Period + count */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {([
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'all', label: 'All' },
            ] as { key: Period; label: string }[]).map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${period === p.key ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-sm font-semibold text-gray-600">📤 Sent: {loading ? '…' : visible.length}</span>
        </div>

        {/* List */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              No review requests sent in this period.
            </div>
          ) : visible.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold text-gray-800 text-sm">{r.client_name || 'Unknown'}</span>
                <span className="text-xs text-gray-400 ml-2">{formatPhone(r.client_phone)}</span>
              </div>
              <span className="text-xs text-gray-500 shrink-0">{formatDate(r.review_request_sent_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Send review modal */}
      {showSend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-gray-800">Send Test Message</h2>
              <button onClick={() => setShowSend(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name for {client_name} <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={sendName}
                  onChange={e => setSendName(e.target.value)}
                  placeholder="e.g. Sarah"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone to send the test to <span className="text-red-400">*</span></label>
                <input
                  type="tel"
                  value={formatPhoneInput(sendPhone)}
                  onChange={e => setSendPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="(626) 123-4567"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 tracking-wide"
                />
              </div>
              {sendResult && (
                <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${sendResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {sendResult.success ? '✅ Test message sent!' : `❌ ${sendResult.error}`}
                </div>
              )}
              <button
                onClick={handleSend}
                disabled={sending || sendPhone.length < 10}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {sending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
