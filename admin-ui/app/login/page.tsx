'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        setError(data.error ?? 'Invalid credentials')
        return
      }
      localStorage.setItem('cozmo_token', data.token)
      router.replace('/')
    } catch {
      setError('Connection error - try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#272525] flex items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: "url('/coze-sign.jpg')" }}
      />
      <div className="absolute inset-0 bg-[#272525]/70" />

      <div className="w-full max-w-[360px] relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-lg border border-[#B88E23]/70 bg-[#B88E23]/15 flex items-center justify-center">
            <span className="text-[#EAD7A0] text-xl font-bold tracking-[0.16em]">CO</span>
          </div>
        </div>

        <h1 className="text-center text-[24px] font-semibold text-white tracking-[0.04em] mb-1">
          COZMO Admin
        </h1>
        <p className="text-center text-[13px] text-[#CFC4A2] mb-8">
          COZE Hospitality 3.0 - Seoul
        </p>

        <form onSubmit={handleSubmit}>
          <div className="bg-white/95 rounded-lg border border-[#E2DCC6] overflow-hidden shadow-2xl shadow-black/25">
            <div className="px-4 py-3.5 border-b border-[#F1EEE3]">
              <label className="block text-[11px] font-semibold text-[#867970] uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@coze.care"
                required
                autoComplete="email"
                className="w-full text-[15px] text-[#272525] placeholder-[#B9B1A4] bg-transparent outline-none"
              />
            </div>
            <div className="px-4 py-3.5">
              <label className="block text-[11px] font-semibold text-[#867970] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="........"
                required
                autoComplete="current-password"
                className="w-full text-[15px] text-[#272525] placeholder-[#B9B1A4] bg-transparent outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-center text-[13px] text-[#FCA5A5]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3.5 rounded-lg bg-[#B88E23] text-white text-[15px] font-semibold tracking-tight transition-opacity disabled:opacity-50 active:opacity-80 hover:bg-[#A08156]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
