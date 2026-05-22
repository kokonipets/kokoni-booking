'use client'

import { useEffect, useState } from 'react'
import ChatOverlay from './ChatOverlay'

type Props = {
  /** Optional override for icon color classes, e.g. "text-gray-700" */
  iconClass?: string
  /** Optional extra classes for the outer button */
  className?: string
}

/**
 * A chat icon button with an unread-count badge. Clicking opens the full-screen
 * ChatOverlay. Self-polls the unread count every 15s while mounted.
 */
export default function ChatIconButton({ iconClass = 'text-gray-700', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/chat/unread?t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled) setUnread(Number(json.count ?? 0))
      } catch {
        /* ignore */
      }
    }
    load()
    const iv = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [open]) // reload after closing so the badge refreshes promptly

  return (
    <>
      <button
        onClick={() => { setUnread(0); setOpen(true) }}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors ${className}`}
        aria-label="Messages"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-6 h-6 ${iconClass}`}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <ChatOverlay open={open} onClose={() => setOpen(false)} />
    </>
  )
}
