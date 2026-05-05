'use client'

import { useEffect, useState } from 'react'

type Props = {
  href?: string
  onClick?: () => void
}

export default function ChatSidebarLink({ href = '/admin/desk/chat', onClick }: Props) {
  const [unread, setUnread] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch('/api/admin/chat/unread', { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled) setUnread(Number(json.count ?? 0))
      } catch {
        /* ignore */
      }
    }
    tick()
    const iv = setInterval(tick, 15000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  return (
    <a
      href={href}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-100 hover:bg-white/5 hover:text-white transition-colors text-left"
    >
      <span className="text-base leading-none w-5 text-center">💬</span>
      <span className="flex-1">Chat</span>
      {unread > 0 && (
        <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
          {unread}
        </span>
      )}
    </a>
  )
}
