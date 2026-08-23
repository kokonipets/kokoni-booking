'use client'

import { useEffect, useRef, useState } from 'react'
import ChatOverlay from './ChatOverlay'

type Props = {
  /** Optional override for icon color classes, e.g. "text-gray-700" */
  iconClass?: string
  /** Optional extra classes for the outer button */
  className?: string
}

// Gentle two-tone "ding" so staff hear a new message. Uses the Web Audio API
// (no file needed). Browsers block audio until the user has interacted with the
// page — since staff are actively using the app, that's already satisfied.
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes = [880, 1175]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
      osc.start(start)
      osc.stop(start + 0.34)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch { /* audio not available */ }
}

function setIconBadge(count: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => void; clearAppBadge?: () => void }
    if (count > 0) nav.setAppBadge?.(count)
    else nav.clearAppBadge?.()
  } catch { /* badging not supported */ }
}

/**
 * A chat icon button with an unread-count badge. Clicking opens the full-screen
 * ChatOverlay. Self-polls the unread count every 15s while mounted, and alerts
 * (sound + desktop notification + app-icon badge) when a new message arrives.
 */
export default function ChatIconButton({ iconClass = 'text-gray-700', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const prevUnread = useRef<number | null>(null)

  // Ask for desktop-notification permission once (on mount; the button click
  // below also re-requests in case the browser needed a user gesture).
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/chat/unread?t=${Date.now()}`, { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        const count = Number(json.count ?? 0)

        // Alert only when the count goes UP (a new message arrived) — and never
        // on the very first load.
        if (prevUnread.current !== null && count > prevUnread.current) {
          playChime()
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const n = new Notification('🐾 New message — Kokoni', {
                body: count > 1 ? `${count} unread messages from clients` : 'New message from a client',
                icon: '/icon-192.png',
                tag: 'kokoni-chat', // replaces the previous one instead of stacking
              })
              n.onclick = () => { window.focus(); n.close() }
            } catch { /* ignore */ }
          }
        }
        prevUnread.current = count
        setUnread(count)
        setIconBadge(count)
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
        onClick={() => {
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
          }
          setUnread(0)
          prevUnread.current = 0
          setIconBadge(0)
          setOpen(true)
        }}
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
