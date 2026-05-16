import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Only intercept the English booking page
  if (pathname !== '/book') return NextResponse.next()

  // If user explicitly chose English (via ?lang=en), let them through
  if (searchParams.get('lang') === 'en') return NextResponse.next()

  const acceptLanguage = request.headers.get('accept-language') || ''
  const lang = acceptLanguage.toLowerCase()

  // Traditional Chinese: zh-TW, zh-HK, zh-Hant
  if (lang.includes('zh-tw') || lang.includes('zh-hk') || lang.includes('zh-hant')) {
    return NextResponse.redirect(new URL('/book-zh-tw', request.url))
  }

  // Simplified Chinese: zh-CN, zh-SG, zh-Hans, or generic zh
  if (lang.includes('zh-cn') || lang.includes('zh-sg') || lang.includes('zh-hans') || /\bzh\b/.test(lang)) {
    return NextResponse.redirect(new URL('/book-zh-cn', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/book',
}
