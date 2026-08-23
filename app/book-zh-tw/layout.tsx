import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni Pet Grooming Salon — 線上預約',
  description: '在 Kokoni Pet Grooming Salon 預約寵物美容服務',
  manifest: '/manifest-book.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kokoni Book',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon-book.png', sizes: '180x180' }],
    icon: [
      { url: '/book-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/book-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/book-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/book-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/book-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#3bb3e0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function BookZhTwLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
