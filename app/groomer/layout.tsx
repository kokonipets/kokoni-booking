import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni Staff',
  description: 'Groomer portal for Kokoni Pet Grooming Salon',
  manifest: '/manifest-staff.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent', // hides the top bar, content goes edge-to-edge
    title: 'Kokoni Staff',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon-staff.png', sizes: '180x180' }],
    icon: [
      { url: '/staff-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/staff-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/staff-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/staff-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/staff-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#9cc089',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // lets content go under notch / home indicator
}

export default function GroomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {children}
    </div>
  )
}
