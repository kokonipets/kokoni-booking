'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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
  media_count?: number | null
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
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function messageTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ChatView() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function syncAndLoadThreads() {
    // Pull new inbound messages from Twilio API (fallback since webhook may not fire)
    try {
      await fetch('/api/admin/chat/sync', { cache: 'no-store' })
    } catch (e) {
      console.error('sync error', e)
    }
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
      // Mark as read
      await fetch('/api/admin/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      // Refresh thread list to update unread counts
      loadThreads()
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    syncAndLoadThreads()
    const iv = setInterval(syncAndLoadThreads, 15000) // sync from Twilio + refresh every 15s
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (selected) {
      loadMessages(selected)
      const iv = setInterval(() => loadMessages(selected), 10000)
      return () => clearInterval(iv)
    }
  }, [selected])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Thread list */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">💬 Messages</h2>
          <input
            type="text"
            placeholder="Search name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No conversations yet. When a customer texts (626) 789-0858, it will appear here.
            </div>
          ) : (
            filteredThreads.map(t => (
              <button
                key={t.phone}
                onClick={() => setSelected(t.phone)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-white transition-colors ${
                  selected === t.phone ? 'bg-white border-l-4 border-l-sky-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-gray-900 text-sm truncate">
                    {t.client_name || formatPhone(t.phone)}
                  </div>
                  <div className="text-xs text-gray-400 shrink-0 ml-2">{relTime(t.last_message_at)}</div>
                </div>
                {t.client_name && (
                  <div className="text-xs text-gray-500 mb-1">{formatPhone(t.phone)}</div>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-600 truncate flex-1">
                    {t.last_direction === 'outbound' && <span className="text-gray-400">You: </span>}
                    {t.last_message}
                  </p>
                  {t.unread > 0 && (
                    <span className="bg-sky-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {t.unread}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message pane */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation to view messages
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="font-semibold text-gray-900">
                {selectedThread?.client_name || formatPhone(selected)}
              </div>
              {selectedThread?.client_name && (
                <div className="text-sm text-gray-500">{formatPhone(selected)}</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map(m => {
                const autoLabel = automatedLabel(m)
                return (
                <div
                  key={m.id}
                  className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      autoLabel
                        ? 'bg-gray-200 text-gray-600 border border-gray-300 rounded-br-sm'
                        : m.direction === 'outbound'
                        ? 'bg-sky-500 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {autoLabel && <div className="text-[10px] font-bold text-gray-500 mb-1">{autoLabel} · automated</div>}
                    {/* Photos (MMS) sent by the client */}
                    {m.direction === 'inbound' && (m.media_count ?? 0) > 0 && m.twilio_sid && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {Array.from({ length: m.media_count ?? 0 }).map((_, k) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={k} href={`/api/admin/chat/media?sid=${m.twilio_sid}&i=${k}`} target="_blank" rel="noreferrer">
                            <img src={`/api/admin/chat/media?sid=${m.twilio_sid}&i=${k}`} alt="Photo from customer"
                              className="rounded-lg max-h-48 object-cover border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    )}
                    {m.body
                      ? <div className={`whitespace-pre-wrap ${autoLabel ? 'text-xs' : 'text-sm'}`}>{m.body}</div>
                      : (m.media_count ?? 0) > 0 ? <div className="text-xs text-gray-400 italic">📷 Photo</div> : null}
                    <div
                      className={`text-[10px] mt-1 ${
                        autoLabel ? 'text-gray-400' : m.direction === 'outbound' ? 'text-sky-100' : 'text-gray-400'
                      }`}
                    >
                      {messageTime(m.created_at)}
                    </div>
                  </div>
                </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-gray-200 bg-white">
              {error && (
                <div className="mb-2 text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              <div className="mt-1 text-[10px] text-gray-400">
                Replies send from (626) 789-0858 via SMS. Standard rates apply.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
