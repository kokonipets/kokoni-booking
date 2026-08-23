import type { Metadata, Viewport } from 'next'

// Render this admin page per-request (don't serve a statically-cached shell), so
// a new deploy's UI shows up immediately instead of a stale build.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kokoni — Admin Mobile',
  description: 'Admin mobile portal for Kokoni Pet Grooming Salon',
  manifest: '/manifest-admin-mobile.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kokoni Admin',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon-admin-mobile.png', sizes: '180x180' }],
    icon: [
      { url: '/admin-mobile-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/admin-mobile-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/admin-mobile-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/admin-mobile-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/admin-mobile-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#7b5ea7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function AdminMobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
