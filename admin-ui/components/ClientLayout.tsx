'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import AuthGuard from './AuthGuard'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

type Theme = 'light' | 'dark'
const THEME_KEY = 'cozmo_theme'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') setTheme(saved)
  }, [])

  function toggleTheme() {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }

  if (path === '/login') {
    return (
      <>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </>
    )
  }

  return (
    <AuthGuard>
      <div className={cn('flex h-screen overflow-hidden bg-background text-foreground', theme === 'dark' && 'admin-dark dark')}>
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />
        <main className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="px-4 pt-4 pb-20 md:px-6 md:pt-6 md:pb-6 md:h-full md:flex md:flex-col">
            {children}
          </div>
        </main>
        <MobileNav />
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </AuthGuard>
  )
}
