import { NextRequest, NextResponse } from 'next/server'

// Promo links like /book?promo=DOUBLE11 (sent in announcements) remember the
// code in a cookie for the rest of the booking, including after the language
// redirect below or a language switch on the page. /api/appointments reads it
// and attaches the code to the new appointment so checkout pre-applies it.
const PROMO_COOKIE = 'kokoni_promo'

function withPromo(request: NextRequest, res: NextResponse) {
  const raw = request.nextUrl.searchParams.get('promo')
  if (!raw) return res
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30)
  if (!code) return res
  res.cookies.set(PROMO_COOKIE, code, { path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax', secure: true })
  return res
}

// Redirect to a Chinese booking page, keeping the query string (e.g. ?walkin=1).
function zhUrl(request: NextRequest, path: string) {
  const u = new URL(path, request.url)
  u.search = request.nextUrl.search
  return u
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Chinese booking pages: only remember a promo code if the link has one.
  if (pathname !== '/book') return withPromo(request, NextResponse.next())

  // If user explicitly chose English (via ?lang=en), let them through
  if (searchParams.get('lang') === 'en') return withPromo(request, NextResponse.next())

  // Kiosk walk-in: always start in English (customers can switch language on the page itself).
  if (searchParams.get('walkin') === '1') return withPromo(request, NextResponse.next())

  const acceptLanguage = request.headers.get('accept-language') || ''
  const lang = acceptLanguage.toLowerCase()

  // Traditional Chinese: zh-TW, zh-HK, zh-Hant
  if (lang.includes('zh-tw') || lang.includes('zh-hk') || lang.includes('zh-hant')) {
    return withPromo(request, NextResponse.redirect(zhUrl(request, '/book-zh-tw')))
  }

  // Simplified Chinese: zh-CN, zh-SG, zh-Hans, or generic zh
  if (lang.includes('zh-cn') || lang.includes('zh-sg') || lang.includes('zh-hans') || /\bzh\b/.test(lang)) {
    return withPromo(request, NextResponse.redirect(zhUrl(request, '/book-zh-cn')))
  }

  return withPromo(request, NextResponse.next())
}

export const config = {
  matcher: ['/book', '/book-zh-tw', '/book-zh-cn'],
}
