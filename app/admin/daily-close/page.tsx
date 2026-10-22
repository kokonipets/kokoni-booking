'use client'

import Link from 'next/link'
import { useAdminGuard } from '@/lib/useAdminGuard'
import DailyClose from '@/components/DailyClose'

// Standalone page: pick a day, see that day's shop report next to the reconciliation
// (card vs Square, cash count, Zelle/Venmo per-payment ticks) and sign it off.
export default function DailyClosePage() {
  const ready = useAdminGuard('daily_close')
  if (!ready) return <div className="min-h-screen bg-gray-50" />
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin/desk" className="text-sky-600 text-sm">← Admin</Link>
          <h1 className="text-xl font-bold text-gray-800">✅ 每日核帳 Daily Close</h1>
        </div>
        <DailyClose />
      </div>
    </div>
  )
}
