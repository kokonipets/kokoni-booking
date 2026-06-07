'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Thread = {
  phone: string
  client_phone: string
  client_name: string | null
  last_message: string
  last_message_at: string
  last_direction: 'inbound' | 'outbound'
  unread: number
}

type Message = {
  id: string
  created_at: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  body: string
  twilio_sid: string | null
  read_at: string | null
  template?: string | null
}

// Labels for automated (system-sent) messages, keyed by sms template name
const AUTOMATED_LABELS: Record<string, string> = {
  notifyClientConfirmed: '📅 Confirmation',
  notifyClientRescheduled: '🔄 Rescheduled',
  notifyClientGroomingReady: '🐾 Pickup ready',
  sendAppointmentReminder: '⏰ Reminder',
  reviewRequest: '📋 Review request',
  reviewResponse: '⭐ Review reply',
  feedbackRequest: '💬 Feedback request',
  reviewLinksSent: '⭐ Review reply',
}
const automatedLabel = (m: Message): string | null => {
  if (m.direction !== 'outbound') return null
  if (m.template && m.template !== 'chatReply') return AUTOMATED_LABELS[m.template] ?? '🤖 Automated'
  if (m.template === 'chatReply') return null
  // Legacy rows (no template column): fall back to body heuristics
  if (m.body.includes('g.page') || m.body.includes('yelp.com/writeareview')) return '⭐ Google/Yelp link sent'
  if (m.body.includes('1-5')) return '📋 Review request'
  return null
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return p
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function messageTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Generate a deterministic avatar color from phone or name
function avatarColor(seed: string) {
  const colors = [
    'bg-sky-500',
    'bg-emerald-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-fuchsia-500',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return colors[hash % colors.length]
}

function initials(name: string | null, phone: string) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  }
  const digits = phone.replace(/\D/g, '').slice(-4)
  return digits.slice(0, 2) || '#'
}

type Props = {
  open: boolean
  onClose: () => void
}

export default function ChatOverlay({ open, onClose }: Props) {
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [threads, setThreads] = useState<Thread[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadThreads() {
    try {
      const res = await fetch('/api/admin/chat/threads', { cache: 'no-store' })
      const json = await res.json()
      setThreads(json.threads ?? [])
      setLoading(false)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  async function loadMessages(phone: string) {
    try {
      const res = await fetch(`/api/admin/chat/messages?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
      const json = await res.json()
      setMessages(json.messages ?? [])
      await fetch('/api/admin/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      loadThreads()
    } catch (e) {
      console.error(e)
    }
  }

  // Load threads when overlay opens, poll while open
  useEffect(() => {
    if (!open) return
    loadThreads()
    const iv = setInterval(loadThreads, 15000)
    return () => clearInterval(iv)
  }, [open])

  // Load messages when a thread is selected, poll while open
  useEffect(() => {
    if (!open || !selected) return
    loadMessages(selected)
    const iv = setInterval(() => loadMessages(selected), 10000)
    return () => clearInterval(iv)
  }, [open, selected])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset to list view when overlay closes
  useEffect(() => {
    if (!open) {
      setView('list')
      setSelected(null)
      setSearch('')
    }
  }, [open])

  // Lock body scroll while overlay is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  async function handleSend() {
    if (!selected || !draft.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected, body: draft.trim() }),
      })
      const json = await res.json()
      if (!json.success && !json.suppressed) {
        setError(json.error?.message ?? 'Failed to send')
      }
      setDraft('')
      loadMessages(selected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads
    const q = search.toLowerCase()
    return threads.filter(
      t =>
        t.phone.includes(q) ||
        (t.client_name?.toLowerCase().includes(q) ?? false) ||
        t.last_message.toLowerCase().includes(q)
    )
  }, [threads, search])

  const selectedThread = threads.find(t => t.phone === selected)

  if (!open) return null

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {view === 'list' ? (
        <>
          {/* List header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
            <div className="w-16" />
            <h1 className="font-bold text-gray-900 text-lg">Messages</h1>
            <button
              onClick={onClose}
              className="w-16 text-right text-sky-600 font-semibold text-base"
            >
              Done
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-2 bg-white border-b border-gray-100">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                {search ? 'No matches.' : 'No conversations yet. When a customer texts (626) 789-0858, it will appear here.'}
              </div>
            ) : (
              filteredThreads.map(t => {
                const isUnread = t.unread > 0
                return (
                  <button
                    key={t.phone}
                    onClick={() => { setSelected(t.phone); setView('thread') }}
                    className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center gap-3"
                  >
                    {/* Unread dot */}
                    <div className="w-2.5 shrink-0 flex items-center justify-center">
                      {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />}
                    </div>
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-full ${avatarColor(t.phone)} text-white font-semibold flex items-center justify-center shrink-0 text-sm`}>
                      {initials(t.client_name, t.phone)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-[15px] ${isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}`}>
                          {t.client_name || formatPhone(t.phone)}
                        </div>
                        <div className={`text-xs shrink-0 ${isUnread ? 'text-sky-600 font-semibold' : 'text-gray-400'}`}>
                          {relTime(t.last_message_at)}
                        </div>
                      </div>
                      <p className={`text-sm truncate mt-0.5 ${isUnread ? 'text-gray-700' : 'text-gray-500'}`}>
                        {t.last_direction === 'outbound' && <span className="text-gray-400">You: </span>}
                        {t.last_message}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </>
      ) : (
        <>
          {/* Thread header */}
          <div className="bg-white border-b border-gray-200 px-2 py-2 flex items-center sticky top-0 z-10" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
            <button
              onClick={() => { setView('list'); setSelected(null) }}
              className="px-3 py-2 text-sky-600 font-medium flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><polyline points="15 18 9 12 15 6"/></svg>
              Messages
            </button>
            <div className="flex-1 text-center">
              <div className="font-semibold text-gray-900 text-[15px] truncate">
                {selectedThread?.client_name || (selected ? formatPhone(selected) : '')}
              </div>
              {selectedThread?.client_name && selected && (
                <div className="text-xs text-gray-500">{formatPhone(selected)}</div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sky-600 font-semibold"
            >
              Done
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const showTimestamp = !prev || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) > 5 * 60 * 1000
              const autoLabel = automatedLabel(m)
              return (
                <div key={m.id}>
                  {showTimestamp && (
                    <div className="text-center text-[11px] text-gray-400 my-2">
                      {messageTime(m.created_at)}
                    </div>
                  )}
                  <div className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                        autoLabel
                          ? 'bg-gray-200 text-gray-600 border border-gray-300 rounded-br-md'
                          : m.direction === 'outbound'
                          ? 'bg-sky-500 text-white rounded-br-md'
                          : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                      }`}
                    >
                      {autoLabel && <p className="text-[10px] font-bold text-gray-500 mb-1">{autoLabel} · automated</p>}
                      <div className={`whitespace-pre-wrap leading-snug ${autoLabel ? 'text-[13px]' : 'text-[15px]'}`}>{m.body}</div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-gray-200 bg-white" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
            {error && (
              <div className="mb-2 text-xs text-red-600 bg-red-50 rounded px-3 py-2 mx-2">{error}</div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Message"
                rows={1}
                className="flex-1 px-4 py-2 text-[15px] bg-gray-100 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none max-h-32"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="w-10 h-10 flex items-center justify-center bg-sky-500 hover:bg-sky-600 disabled:bg-gray-300 text-white rounded-full shrink-0 transition-colors"
                aria-label="Send"
              >
                {sending ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" strokeLinecap="round"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3 12l18-9-4 9 4 9z"/></svg>
                )}
              </button>
            </div>
            <div className="mt-1 px-2 text-[10px] text-gray-400">
              Sends from (626) 789-0858. Standard rates apply.
            </div>
          </div>
        </>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
