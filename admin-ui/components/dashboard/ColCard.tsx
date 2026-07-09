import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface ColCardProps {
  label: string
  count?: number
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function ColCard({ label, count, action, children, className }: ColCardProps) {
  return (
    <div className={cn('flex flex-col bg-white rounded-lg border border-[#E2DCC6] min-h-[480px] md:h-full md:min-h-0 overflow-hidden shadow-sm', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2DCC6] shrink-0 bg-[#FFFCF7]">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-[#867970] uppercase tracking-wider">{label}</p>
          {count !== undefined && (
            <span className="text-[10px] font-semibold text-[#5C4E3D] bg-[#F1EEE3] px-1.5 py-0.5 rounded-full tabular-nums">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
