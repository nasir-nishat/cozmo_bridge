'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Sparkles, CheckSquare, CalendarDays, ListTodo,
  Bell, Activity, BookOpen, Users, User, MessageCircle, MessageSquare, LogOut, LineChart,
  Sun, Moon, ClipboardCheck, Hammer,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  Icon: LucideIcon
  label: string
  group: 'cozmo' | 'ops' | 'platforms'
  exact?: boolean
}

const NAV: NavItem[] = [
  { href: '/tasks',    Icon: ListTodo,        label: 'Cozmo AI Tasks', group: 'cozmo' },
  { href: '/chat',     Icon: Sparkles,        label: 'Ask COZMO',      group: 'cozmo' },
  { href: '/',         Icon: LayoutDashboard, label: 'Dashboard',      group: 'ops',       exact: true },
  { href: '/ops',      Icon: CheckSquare,     label: 'Action Board',   group: 'ops' },
  { href: '/bookings', Icon: CalendarDays,    label: 'Bookings',       group: 'ops' },
  { href: '/analytics', Icon: LineChart,      label: 'Analytics',      group: 'ops' },
  { href: '/alerts',   Icon: Bell,            label: 'Alerts',         group: 'ops' },
  { href: '/health',   Icon: Activity,        label: 'Health',         group: 'ops' },
  { href: '/kb',       Icon: BookOpen,        label: 'Knowledge Base', group: 'ops' },
  { href: '/group-builds', Icon: Hammer,      label: 'Group Builds',   group: 'platforms' },
  { href: '/checklist', Icon: ClipboardCheck, label: 'Guest Checklist', group: 'platforms' },
  { href: '/groups',   Icon: Users,           label: 'Groups',         group: 'platforms' },
  { href: '/messages', Icon: MessageSquare,   label: 'Messages',       group: 'platforms' },
  { href: '/staff',    Icon: User,            label: 'Staff',          group: 'platforms' },
  { href: '/kakao',    Icon: MessageCircle,   label: 'KakaoTalk',      group: 'platforms' },
]

const GROUP_LABELS: Record<string, string> = {
  cozmo: 'COZMO',
  ops: 'Operations',
  platforms: 'Platforms',
}

interface SidebarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  const path = usePathname()
  const router = useRouter()
  const dark = theme === 'dark'

  function logout() {
    localStorage.removeItem('cozmo_token')
    router.replace('/login')
  }

  return (
    <aside className={cn(
      'hidden md:flex flex-col w-48 shrink-0 border-r',
      dark ? 'border-[#3A352F] bg-[#272525] text-white' : 'border-[#E2DCC6] bg-white text-[#272525]',
    )}>
      {/* Logo */}
      <div className={cn('px-4 py-4 border-b', dark ? 'border-white/10' : 'border-[#E2DCC6]')}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg border border-[#B88E23]/70 bg-[#B88E23]/15 flex items-center justify-center text-[#B88E23] text-[11px] font-bold tracking-[0.12em] shrink-0">
            CO
          </div>
          <div className="min-w-0">
            <p className={cn('text-[13px] font-semibold leading-none tracking-[0.08em]', dark ? 'text-white' : 'text-[#272525]')}>COZMO</p>
            <p className={cn('text-[10px] mt-1 leading-none truncate', dark ? 'text-[#CFC4A2]' : 'text-[#867970]')}>COZE Hospitality 3.0</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {(['cozmo', 'ops', 'platforms'] as const).map(g => (
          <div key={g} className="mb-1">
            <p className={cn('px-3.5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider', dark ? 'text-[#AD9362]' : 'text-[#B88E23]')}>
              {GROUP_LABELS[g]}
            </p>
            {NAV.filter(item => item.group === g).map(item => {
              const active = item.exact ? path === item.href : path.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 mx-2 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors',
                    active
                      ? 'bg-[#B88E23] text-white font-medium shadow-sm'
                      : dark
                        ? 'text-[#D8D5D0] hover:bg-white/8 hover:text-white'
                        : 'text-[#5C4E3D] hover:bg-[#F1EEE3] hover:text-[#272525]',
                  )}
                >
                  <item.Icon className={cn(
                    'w-[15px] h-[15px] shrink-0 transition-colors',
                    active ? 'text-white' : dark ? 'text-[#AD9362]' : 'text-[#B88E23]',
                  )} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('px-4 py-3 border-t', dark ? 'border-white/10' : 'border-[#E2DCC6]')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
            <span className={cn('text-[10px]', dark ? 'text-[#CFC4A2]' : 'text-[#867970]')}>Bridge :3001</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleTheme}
              title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              className={cn(
                'p-1 rounded-md transition-colors touch-manipulation',
                dark ? 'text-[#CFC4A2] hover:text-white hover:bg-white/8' : 'text-[#867970] hover:text-[#272525] hover:bg-[#F1EEE3]',
              )}
            >
              {dark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={logout}
              className={cn(
                'flex items-center gap-1 text-[10px] transition-colors touch-manipulation',
                dark ? 'text-[#CFC4A2] hover:text-white' : 'text-[#867970] hover:text-[#272525]',
              )}
            >
              <LogOut className="w-3 h-3" />
              Out
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
