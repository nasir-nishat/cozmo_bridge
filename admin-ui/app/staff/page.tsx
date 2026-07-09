'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffMember } from '@/lib/types'

const BRIDGE = '/api/bridge'

function formatPhone(p: string) {
  if (!p || p.length < 8) return p || '—'
  return `+${p.slice(0, 2)} ${p.slice(2, 4)}-${p.slice(4, 8)}-${p.slice(8)}`
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/staff`)
      const data = await res.json()
      if (data.ok) setStaff(data.staff)
    } catch { /* bridge offline */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const active = staff.filter(m => m.active).length

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Staff</h1>
          {staff.length > 0 && (
            <p className="text-[12px] text-[#8e8e93] mt-0.5">{active} active · {staff.length} total</p>
          )}
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      {loading ? (
        <p className="text-[13px] text-[#6e6e73] py-12 text-center">Loading…</p>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-lg border border-border py-10 text-center">
          <p className="text-[13px] text-[#8e8e93]">No staff found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          {staff.map((m, i) => (
            <div key={m.name}>
              {i > 0 && <div className="h-px bg-border ml-16" />}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                  m.active ? 'bg-[#f2f2f7]' : 'bg-[#f9f9f9] opacity-50',
                )}>
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">{initials(m.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[14px] font-semibold', m.active ? 'text-[#1d1d1f]' : 'text-[#8e8e93]')}>
                    {m.name}
                  </p>
                  <p className="text-[12px] text-[#6e6e73] mt-0.5">
                    {m.role || '—'} · {formatPhone(m.phone)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.dev && (
                    <span className="px-1.5 py-0.5 rounded bg-[#007aff] text-white text-[10px] font-medium">Dev</span>
                  )}
                  <div className={cn('w-1.5 h-1.5 rounded-full', m.active ? 'bg-[#34c759]' : 'bg-[#c7c7cc]')} />
                  <span className={cn('text-[11px]', m.active ? 'text-[#34c759]' : 'text-[#8e8e93]')}>
                    {m.active ? 'Active' : 'Off'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </>
  )
}
