import { NextRequest, NextResponse } from 'next/server'

// Redirect to a Chinese booking page, keeping the query string (e.g. ?walkin=1).
function zhUrl(request: NextRequest, path: string) {
  const u = new URL(path, request.url)
  u.search = request.nextUrl.search
  return u
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Only intercept the English booking page
  if (pathname !== '/book') return NextResponse.next()

  // If user explicitly chose English (via ?lang=en), let them through
  if (searchParams.get('lang') === 'en') return NextResponse.next()

  // Kiosk walk-in: always start in English (customers can switch language on the page itself).
  if (searchParams.get('walkin') === '1') return NextResponse.next()

  const acceptLanguage = request.headers.get('accept-language') || ''
  const lang = acceptLanguage.toLowerCase()

  // Traditional Chinese: zh-TW, zh-HK, zh-Hant
  if (lang.includes('zh-tw') || lang.includes('zh-hk') || lang.includes('zh-hant')) {
    return NextResponse.redirect(zhUrl(request, '/book-zh-tw'))
  }

  // Simplified Chinese: zh-CN, zh-SG, zh-Hans, or generic zh
  if (lang.includes('zh-cn') || lang.includes('zh-sg') || lang.includes('zh-hans') || /\bzh\b/.test(lang)) {
    return NextResponse.redirect(zhUrl(request, '/book-zh-cn'))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/book',
}
