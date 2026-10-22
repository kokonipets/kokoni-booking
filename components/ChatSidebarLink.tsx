'use client'

import { useEffect, useState } from 'react'

type Props = {
  href?: string
  onClick?: () => void
  className?: string // override the default look (used by the grouped sidebar)
  noIcon?: boolean
}

export default function ChatSidebarLink({ href = '/admin/desk/chat', onClick, className, noIcon }: Props) {
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
      className={className ?? "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"}
    >
      {!noIcon && <span className="text-base leading-none w-5 text-center">💬</span>}
      <span className="flex-1">Chat 聊天</span>
      {unread > 0 && (
        <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
          {unread}
        </span>
      )}
    </a>
  )
}
