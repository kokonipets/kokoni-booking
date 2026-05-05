import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni — Admin Desktop',
  description: 'Admin desktop portal for Kokoni Pet Grooming Salon',
  manifest: '/manifest-admin-desk.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kokoni Desk',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon-admin-desk.png', sizes: '180x180' }],
    icon: [
      { url: '/admin-desk-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/admin-desk-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/admin-desk-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/admin-desk-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/admin-desk-favicon-32.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#3a4a6b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function AdminDeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
