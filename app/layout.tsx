import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Book Online | Kokoni Pet Grooming Salon',
  description: 'Request a grooming appointment at Kokoni Pet Grooming Salon.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: [{ url: '/favicon.ico' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Force light color scheme so Safari dark mode never inverts input text colors */}
        <meta name="color-scheme" content="light" />
      </head>
      <body className="min-h-screen bg-sky-50 text-gray-900">{children}</body>
    </html>
  )
}
