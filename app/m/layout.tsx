import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni Pet Grooming Salon — Check In',
  description: 'Mobile check in & check out for Kokoni Pet Grooming Salon',
  manifest: '/manifest-mobile.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kokoni Check-In',
  },
  icons: {
    apple: '/kiosk-icon-192.png',
    icon: '/kiosk-icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function MobileKioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {children}
    </div>
  )
}
