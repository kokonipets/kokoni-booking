import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni Pet Grooming Salon Kiosk',
  description: 'Check in & check out kiosk for Kokoni Pet Grooming Salon',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kokoni Kiosk',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon-kiosk.png', sizes: '180x180' }],
    icon: [
      { url: '/kiosk-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/kiosk-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/kiosk-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/kiosk-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/kiosk-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#e8765a',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Prevent screen from sleeping on Android kiosk devices */}
      <meta httpEquiv="mobile-web-app-capable" content="yes" />
      {children}
    </>
  )
}
