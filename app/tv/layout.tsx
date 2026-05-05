import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni Grooming Board — TV',
}

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-900">
      {children}
    </div>
  )
}
