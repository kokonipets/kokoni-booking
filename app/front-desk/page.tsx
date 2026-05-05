'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import ChatIconButton from '@/components/ChatIconButton'

const REMEMBER_KEY = 'fd_saved_username'
const AUTH_KEY = 'fd_authed_user'

export default function FrontDeskPage() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  const [authedUser, setAuthedUser] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }))
      setDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem(AUTH_KEY)
    if (saved) setAuthedUser(saved)
    const rem = localStorage.getItem(REMEMBER_KEY)
    if (rem) { setUsername(rem); setRemember(true) }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Incorrect username or password'); return }
      if (remember) localStorage.setItem(REMEMBER_KEY, username.trim())
      else localStorage.removeItem(REMEMBER_KEY)
      const displayName = data.user?.name || username.trim()
      sessionStorage.setItem(AUTH_KEY, displayName)
      setAuthedUser(displayName)
      setPassword('')
    } catch { setError('Connection error. Please try again.') }
    finally { setLoading(false) }
  }

  const handleSignOut = () => {
    sessionStorage.removeItem(AUTH_KEY)
    setAuthedUser(null)
    setPassword('')
  }

  const tiles = [
    {
      label: 'Book',
      emoji: '📅',
      sub: 'View & manage the calendar',
      href: '/admin/desk?mode=book',
      from: 'from-sky-400',
      to: 'to-sky-600',
      shadow: 'shadow-sky-200',
      textAccent: 'text-sky-100',
    },
    {
      label: 'Check In / Out',
      emoji: '🐾',
      sub: 'Arrive · groom · pick up',
      href: '/front-desk/checkin',
      from: 'from-violet-400',
      to: 'to-violet-600',
      shadow: 'shadow-violet-200',
      textAccent: 'text-violet-100',
    },
    {
      label: 'Cashier',
      emoji: '💰',
      sub: 'Payments & checkout',
      href: '/cashier',
      from: 'from-emerald-400',
      to: 'to-emerald-600',
      shadow: 'shadow-emerald-200',
      textAccent: 'text-emerald-100',
    },
    {
      label: 'Messages',
      emoji: '💬',
      sub: 'Text with customers',
      href: '/front-desk/chat',
      from: 'from-rose-400',
      to: 'to-rose-600',
      shadow: 'shadow-rose-200',
      textAccent: 'text-rose-100',
    },
  ]

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 flex flex-col items-center justify-center relative overflow-hidden select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background blobs */}
      <div className="absolute -top-60 -left-60 w-[700px] h-[700px] bg-sky-100 rounded-full opacity-50 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-60 -right-60 w-[700px] h-[700px] bg-violet-100 rounded-full opacity-50 blur-3xl pointer-events-none" />

      {/* ── SIGN-IN SCREEN ── */}
      {!authedUser ? (
        <div className="w-full flex flex-col items-center gap-8 px-6 z-10">

          {/* Logo + Clock */}
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-3xl shadow-xl p-5 ring-1 ring-gray-100">
              <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={140} height={105} className="object-contain" priority />
            </div>
            <div className="text-center">
              <p className="text-7xl font-black text-gray-800 tabular-nums tracking-tight leading-none">{time}</p>
              <p className="text-2xl text-gray-400 font-medium mt-2">{date}</p>
            </div>
          </div>

          {/* Sign-in card */}
          <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-10 ring-1 ring-gray-100">
            <p className="text-3xl font-black text-gray-800 text-center mb-1">Staff Sign In</p>
            <p className="text-base text-gray-400 text-center mb-8">Use your staff username &amp; password</p>

            <div className="space-y-4 mb-5">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            <label className="flex items-center gap-3 text-base text-gray-500 mb-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-5 h-5 rounded accent-sky-500"
              />
              Remember my username
            </label>

            {error && <p className="text-red-500 text-base text-center mb-4">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full bg-gradient-to-r from-sky-500 to-violet-500 hover:from-sky-600 hover:to-violet-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition-all text-xl shadow-lg shadow-sky-200"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

      ) : (
        /* ── DASHBOARD ── */
        <div className="w-full flex flex-col items-center gap-8 px-6 z-10">

          {/* Logo + big clock */}
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-3xl shadow-xl p-5 ring-1 ring-gray-100">
              <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={140} height={105} className="object-contain" priority />
            </div>
            <div className="text-center">
              <p className="text-7xl font-black text-gray-800 tabular-nums tracking-tight leading-none">{time}</p>
              <p className="text-2xl text-gray-400 font-medium mt-2">{date}</p>
            </div>
          </div>

          {/* User chip */}
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-md px-5 py-3 ring-1 ring-gray-100">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-white font-black text-sm">
              {authedUser.charAt(0).toUpperCase()}
            </div>
            <p className="text-sm font-black text-gray-800">Hi, {authedUser}!</p>
            <span className="text-gray-200">·</span>
            <ChatIconButton />
            <span className="text-gray-200">·</span>
            <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Sign out
            </button>
          </div>

          {/* Tiles */}
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-6">
            {tiles.map(tile => (
              <a
                key={tile.label}
                href={tile.href}
                className={`
                  group relative flex flex-col items-center justify-center gap-5
                  bg-gradient-to-br ${tile.from} ${tile.to}
                  text-white rounded-3xl
                  shadow-2xl ${tile.shadow}
                  py-16 px-8
                  active:scale-95 transition-all duration-150
                  overflow-hidden
                `}
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-10 rounded-full blur-3xl pointer-events-none translate-x-8 -translate-y-8" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black opacity-5 rounded-full blur-2xl pointer-events-none -translate-x-4 translate-y-4" />
                <span className="text-8xl leading-none drop-shadow-lg transition-transform group-hover:scale-110 duration-200 z-10">
                  {tile.emoji}
                </span>
                <div className="text-center z-10">
                  <p className="text-3xl font-black tracking-tight leading-tight">{tile.label}</p>
                  <p className={`text-base font-medium mt-1.5 ${tile.textAccent}`}>{tile.sub}</p>
                </div>
                <div className="absolute bottom-5 right-6 opacity-40 text-2xl group-hover:opacity-70 transition-opacity z-10">›</div>
              </a>
            ))}
          </div>

          <p className="text-xs text-gray-300 font-medium z-10">Kokoni Pet Grooming Salon · Front Desk</p>
        </div>
      )}
    </div>
  )
}
