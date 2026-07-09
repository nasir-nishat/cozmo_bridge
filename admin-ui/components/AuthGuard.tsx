'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'redirecting' | 'ready'>('checking')

  useEffect(() => {
    const token = localStorage.getItem('cozmo_token')
    if (!token) {
      setState('redirecting')
      router.replace('/login')
      window.location.replace('/login')
      return
    }

    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    })
      .then(r => r.json())
      .then((data: { valid: boolean }) => {
        if (!data.valid) {
          localStorage.removeItem('cozmo_token')
          setState('redirecting')
          router.replace('/login')
          window.location.replace('/login')
        } else {
          setState('ready')
        }
      })
      .catch(() => {
        // Verification timeout/network issue: allow through so the app does not hang forever.
        setState('ready')
      })
  }, [router])

  if (state !== 'ready') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f7] text-[#6e6e73]">
        <div className="w-2 h-2 rounded-full bg-[#c7c7cc] animate-pulse" />
        <p className="text-[12px] font-medium">
          {state === 'redirecting' ? 'Redirecting to login...' : 'Checking session...'}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
