'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CheckSquare, CalendarDays, Bell, Sparkles, BookOpen, Activity, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tab { href: string; label: string; Icon: LucideIcon }

const TABS: Tab[] = [
  { href: '/ops',      label: 'Ops',      Icon: CheckSquare  },
  { href: '/bookings', label: 'Bookings', Icon: CalendarDays },
  { href: '/alerts',   label: 'Alerts',   Icon: Bell         },
  { href: '/chat',     label: 'Chat',     Icon: Sparkles     },
  { href: '/kb',       label: 'KB',       Icon: BookOpen     },
  { href: '/health',   label: 'Health',   Icon: Activity     },
]

export default function MobileNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-[#E2DCC6] bg-[#272525]/95 backdrop-blur-xl">
      <div className="flex h-14">
        {TABS.map(({ href, label, Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation transition-colors',
                active ? 'text-[#EAD7A0]' : 'text-[#CFC4A2]',
              )}
            >
              <Icon className="w-[19px] h-[19px]" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}
