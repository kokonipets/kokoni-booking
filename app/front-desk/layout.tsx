import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Front Desk | Kokoni Pet Grooming Salon',
  description: 'Front desk portal for Kokoni Pet Grooming Salon staff.',
  manifest: '/manifest-front-desk.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Front Desk',
    startupImage: '/apple-touch-icon-front-desk.png',
  },
  icons: {
    apple: [
      { url: '/apple-touch-icon-front-desk.png', sizes: '180x180' },
    ],
    icon: [
      { url: '/front-desk-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/front-desk-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/front-desk-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/front-desk-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/front-desk-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#e89838',
}

export default function FrontDeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
