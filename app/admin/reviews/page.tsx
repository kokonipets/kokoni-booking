'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAdminGuard } from '@/lib/useAdminGuard'

type Review = {
  id: string
  client_name: string
  client_phone: string
  rating: number | null
  status: 'pending' | 'positive' | 'negative'
  response_text: string | null
  review_request_sent_at: string | null
  rating_received_at: string | null
  created_at: string
  admin_notes?: string | null
  follow_up_flagged?: boolean
  review_link_sent?: string | null
}

type Metrics = {
  sent: number
  responses: number
  positive: number
  negative: number
  responseRate: number
  averageRating: string | null
}

const STAR = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐']

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return phone
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ReviewsPage() {
  const guardReady = useAdminGuard('reviews')
  const [reviews, setReviews] = useState<Review[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'positive' | 'negative' | 'flagged'>('all')
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  // Send modal
  const [showSend, setShowSend] = useState(false)
  const [sendPhone, setSendPhone] = useState('')
  const [sendName, setSendName] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success?: boolean; error?: string } | null>(null)

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      const res = await fetch(`/api/admin/reviews/metrics?period=${period}`)
      const data = await res.json()
      setMetrics(data)
    } catch {}
    setMetricsLoading(false)
  }, [period])

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (filter !== 'all' && filter !== 'flagged') params.set('status', filter)
      const res = await fetch(`/api/admin/reviews/list?${params}`)
      const data = await res.json()
      let list: Review[] = data.reviews || []
      if (filter === 'flagged') list = list.filter((r: Review) => r.follow_up_flagged)
      setReviews(list)
    } catch {}
    setReviewsLoading(false)
  }, [filter])

  useEffect(() => { loadMetrics() }, [loadMetrics])
  useEffect(() => { loadReviews() }, [loadReviews])

  const handleFlag = async (review: Review) => {
    const flagged = !review.follow_up_flagged
    try {
      await fetch(`/api/admin/reviews/list`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, follow_up_flagged: flagged }),
      })
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, follow_up_flagged: flagged } : r))
    } catch {}
  }

  const handleSaveNote = async (review: Review) => {
    const note = noteInputs[review.id] ?? review.admin_notes ?? ''
    setSavingNote(review.id)
    try {
      await fetch(`/api/admin/reviews/list`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, admin_notes: note }),
      })
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, admin_notes: note } : r))
    } catch {}
    setSavingNote(null)
  }

  const handleSend = async () => {
    if (sendPhone.length < 10) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/reviews/manual-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPhone: sendPhone, clientName: sendName }),
      })
      const data = await res.json()
      setSendResult(data)
      if (data.success) {
        setSendPhone('')
        setSendName('')
        setTimeout(() => { setShowSend(false); setSendResult(null); loadReviews() }, 1500)
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

  const ratingColor = (r: number | null) => {
    if (!r) return 'text-gray-400'
    if (r >= 4) return 'text-emerald-600'
    if (r === 3) return 'text-amber-500'
    return 'text-rose-600'
  }

  const statusBadge = (r: Review) => {
    if (r.follow_up_flagged) return <span className="px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full">🚩 Follow-up</span>
    if (r.status === 'positive') return <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">✅ Positive</span>
    if (r.status === 'negative') return <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 rounded-full">⚠️ Negative</span>
    return <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500 rounded-full">⏳ Pending</span>
  }

  if (!guardReady) return <div className="min-h-screen bg-gray-50" />

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-800">⭐ Review History</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track review requests sent and client responses</p>
          </div>
          <button
            onClick={() => { setShowSend(true); setSendResult(null) }}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            + Send Review Request
          </button>
        </div>

        {/* Metrics */}
        <div>
          <div className="flex gap-2 mb-3">
            {(['today', 'week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${period === p ? 'bg-violet-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Sent', value: metricsLoading ? '…' : metrics?.sent ?? 0, icon: '📤' },
              { label: 'Replied', value: metricsLoading ? '…' : metrics?.responses ?? 0, icon: '💬' },
              { label: 'Response Rate', value: metricsLoading ? '…' : `${metrics?.responseRate ?? 0}%`, icon: '📊' },
              { label: 'Positive', value: metricsLoading ? '…' : metrics?.positive ?? 0, icon: '✅' },
              { label: 'Avg Rating', value: metricsLoading ? '…' : metrics?.averageRating ? `${metrics.averageRating} ★` : '—', icon: '⭐' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
                <div className="text-xl mb-1">{stat.icon}</div>
                <div className="text-xl font-black text-gray-800">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'all', label: 'All' },
            { key: 'pending', label: '⏳ Pending' },
            { key: 'positive', label: '✅ Positive' },
            { key: 'negative', label: '⚠️ Negative' },
            { key: 'flagged', label: '🚩 Follow-up' },
          ] as { key: typeof filter; label: string }[]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filter === f.key ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Review list */}
        <div className="space-y-2">
          {reviewsLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              No reviews found for this filter.
            </div>
          ) : reviews.map(review => (
            <div key={review.id} className={`bg-white rounded-2xl border transition-all ${review.follow_up_flagged ? 'border-orange-200' : 'border-gray-100'}`}>
              {/* Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 rounded-2xl"
                onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
              >
                {/* Rating stars */}
                <div className={`text-lg font-black w-16 shrink-0 ${ratingColor(review.rating)}`}>
                  {review.rating ? `${review.rating} ★` : '—'}
                </div>

                {/* Client info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{review.client_name || 'Unknown'}</span>
                    <span className="text-xs text-gray-400">{formatPhone(review.client_phone)}</span>
                    {statusBadge(review)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>Sent {formatDate(review.review_request_sent_at)}</span>
                    {review.rating_received_at && <span>· Replied {formatDate(review.rating_received_at)}</span>}
                    {review.review_link_sent && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-semibold">
                        🔗 Google/Yelp link sent
                      </span>
                    )}
                  </div>
                </div>

                {/* Response preview */}
                {review.response_text && (
                  <div className="hidden sm:block text-xs text-gray-500 italic max-w-xs truncate">
                    "{review.response_text}"
                  </div>
                )}

                <span className="text-gray-300 text-sm ml-2">{expandedId === review.id ? '▲' : '▼'}</span>
              </div>

              {/* Expanded detail */}
              {expandedId === review.id && (
                <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                  {/* Full response */}
                  {review.response_text && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Client&apos;s Reply</p>
                      <p className="text-sm text-gray-700">{review.response_text}</p>
                    </div>
                  )}

                  {/* Star visual */}
                  {review.rating && (
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{STAR[review.rating]}</span>
                      <span className="text-sm text-gray-600 font-medium">{review.rating}/5 stars</span>
                    </div>
                  )}

                  {/* Admin notes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Internal Notes</p>
                    <textarea
                      rows={2}
                      placeholder="Add a follow-up note…"
                      value={noteInputs[review.id] ?? review.admin_notes ?? ''}
                      onChange={e => setNoteInputs(prev => ({ ...prev, [review.id]: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleSaveNote(review)}
                      disabled={savingNote === review.id}
                      className="px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {savingNote === review.id ? 'Saving…' : 'Save Note'}
                    </button>
                    <button
                      onClick={() => handleFlag(review)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                        review.follow_up_flagged
                          ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {review.follow_up_flagged ? '🚩 Unflag' : '🚩 Flag for Follow-up'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Send review modal */}
      {showSend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-gray-800">Send Review Request</h2>
              <button onClick={() => setShowSend(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Customer Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={sendName}
                  onChange={e => setSendName(e.target.value)}
                  placeholder="e.g. Sarah"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number <span className="text-red-400">*</span></label>
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
                  {sendResult.success ? '✅ Review request sent!' : `❌ ${sendResult.error}`}
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
