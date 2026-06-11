'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { saveAuth } from '@/lib/authStorage'

const REMEMBER_KEY = 'kokoni_saved_username'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load saved username on mount
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      setUsername(saved)
      setRemember(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Login failed')
        return
      }

      // Save or clear username based on checkbox
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, username.trim())
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }

      saveAuth(data.user)

      if (data.user.role === 'admin') {
        router.push('/admin/desk')
      } else if (data.user.role === 'groomer' || data.user.role === 'bather') {
        router.push('/groomer/dashboard')
      } else {
        router.push('/kiosk')
      }
    } catch (err) {
      setError('Connection error. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen min-h-dvh bg-gradient-to-b from-sky-400 to-sky-600 flex flex-col">
      {/* Top safe-area spacer (notch) */}
      <div className="flex-shrink-0" style={{ height: 'env(safe-area-inset-top)' }} />

      {/* Header bar — mimics native app nav bar */}
      <div className="flex items-center justify-center px-5 pt-4 pb-2">
        <span className="text-white font-semibold text-base tracking-wide">Kokoni Staff</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">

        {/* Logo card */}
        <div className="bg-white rounded-3xl shadow-2xl p-5 mb-6 ring-4 ring-white/30">
          <Image src="/logo.png" alt="Kokoni" width={72} height={72} className="rounded-2xl" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Kokoni Pet Grooming Salon</h1>
        <p className="text-sky-100 text-sm mb-8">Staff Portal</p>

        {/* Login card */}
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your username"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"
              required
            />
          </div>

          {/* Remember username */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setRemember(r => !r)}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                remember ? 'bg-sky-500 border-sky-500' : 'border-gray-300 bg-white'
              }`}
            >
              {remember && (
                <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                  <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-600">Remember my username</span>
          </label>

          {/* Login button */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading || !username || !password}
            className="w-full py-3.5 bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-base shadow-md shadow-sky-200"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>

        <p className="text-sky-200 text-xs mt-6 text-center">
          Contact your administrator for login credentials
        </p>
      </div>

      {/* Bottom safe-area spacer (home indicator) */}
      <div className="flex-shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}
