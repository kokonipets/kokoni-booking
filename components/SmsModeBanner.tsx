'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Sticky banner shown on admin pages when SMS is not in "live" mode.
 * Prevents anyone (including the owner) from forgetting that customers
 * are not actually receiving texts.
 */
export default function SmsModeBanner() {
  const [mode, setMode] = useState<'live' | 'test' | 'off' | null>(null)

  useEffect(() => {
    fetch('/api/admin/sms-mode')
      .then(r => r.json())
      .then(d => setMode(d.mode))
      .catch(() => {})
  }, [])

  if (!mode || mode === 'live') return null

  const bg = mode === 'test' ? 'bg-amber-400' : 'bg-gray-700'
  const text = mode === 'test'
    ? '⚠️ SMS TEST MODE — customers are NOT receiving texts (only whitelisted numbers are).'
    : '🛑 SMS is OFF — no texts are being sent at all.'

  return (
    <div className={`${bg} text-black/90 text-xs sm:text-sm font-semibold px-3 py-1.5 flex items-center justify-center gap-3 sticky top-0 z-50`}>
      <span>{text}</span>
      <Link href="/admin/sms-log" className="underline hover:no-underline">View log →</Link>
    </div>
  )
}
