import ChatView from '@/components/ChatView'
import Link from 'next/link'

export const metadata = { title: 'Chat — Kokoni Admin' }

export default function AdminChatPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <Link
          href="/admin/desk"
          className="flex items-center gap-1 text-sky-600 font-medium hover:text-sky-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>
        <h1 className="font-bold text-gray-800 text-lg">Messages</h1>
        <Link
          href="/admin/desk"
          className="text-sky-600 font-semibold hover:text-sky-700"
        >
          Done
        </Link>
      </div>
      <div className="p-4">
        <ChatView />
      </div>
    </div>
  )
}
