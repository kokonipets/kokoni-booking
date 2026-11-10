'use client'

import { useEffect, useState } from 'react'

// Shows a small "your promo will be applied" note on the booking pages when the
// client arrived from a promo link (?promo=CODE). The code itself is remembered
// in a cookie by middleware.ts; this only displays it. The discount is applied
// by staff at checkout (pre-selected for them), so this never promises an
// amount — just that the code is on the booking.
export default function PromoBanner({ lang }: { lang: 'en' | 'zh-TW' | 'zh-CN' }) {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('promo')
    const fromCookie = document.cookie.split('; ').find(c => c.startsWith('kokoni_promo='))?.split('=')[1]
    const c = (fromUrl || fromCookie || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30)
    if (c) setCode(c)
  }, [])
  if (!code) return null
  const text = lang === 'zh-TW'
    ? `🎉 優惠碼 ${code} 已套用，結帳時會自動折抵`
    : lang === 'zh-CN'
      ? `🎉 优惠码 ${code} 已套用，结账时会自动折抵`
      : `🎉 Promo code ${code} is on your booking. Your discount will be applied at checkout.`
  return (
    <div style={{ background: '#FFF4E5', color: '#9A4B00', fontSize: 14, fontWeight: 600, textAlign: 'center', padding: '8px 12px' }}>
      {text}
    </div>
  )
}
