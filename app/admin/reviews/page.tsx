'use client'
import { useState } from 'react'

export default function AdminReviewsPage() {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null)

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
  }

  const handleSend = async () => {
    if (phone.length < 10) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/reviews/manual-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPhone: phone, clientName: name }),
      })
      const data = await res.json()
      setResult(data)
      if (data.success) {
        setPhone('')
        setName('')
      }
    } catch {
      setResult({ error: 'Network error — please try again' })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-4xl">⭐</span>
          <div>
            <h1 className="text-2xl font-black text-gray-800">Send Review Request</h1>
            <p className="text-gray-500 text-sm">Manually send a review SMS to any customer</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Name <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sarah"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number <span className="text-red-400">*</span></label>
            <input
              type="tel"
              value={formatPhone(phone)}
              onChange={handlePhoneChange}
              placeholder="(626) 123-4567"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 text-lg tracking-wide"
            />
          </div>

          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.success ? '✅ Review request sent successfully!' : `❌ ${result.error}`}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={phone.length < 10 || loading}
            className="w-full bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white font-black py-4 rounded-xl text-lg shadow-md active:scale-95 transition-all"
          >
            {loading ? '⏳ Sending…' : '📨 Send Review SMS'}
          </button>

          <a
            href="/admin/desk"
            className="block text-center text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            ← Back to Admin
          </a>
        </div>
      </div>
    </div>
  )
}
