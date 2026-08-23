import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kokoni — Window Display',
}

export default function WindowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black overflow-hidden">
      {children}
    </div>
  )
}
