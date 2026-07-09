'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { BookOpen, Search, RefreshCcw, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const BRIDGE = '/api/bridge'

interface KBEntry {
  id: string
  propertyCode: string
  category: string
  title: string
  triggers: string[]
  facts: string[]
  links: string[]
  sensitive: boolean
}

interface SyncResult {
  id: string
  status: 'updated' | 'skipped' | 'failed'
  factsCount?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  amenities:    'Amenities',
  checkin:      'Check-in',
  checkout:     'Check-out',
  experiences:  'Experiences',
  food:         'Food',
  'house-rules':'House Rules',
  neighborhood: 'Neighborhood',
  payment:      'Payment',
  property:     'Property',
  safety:       'Safety',
  services:     'Services',
  transport:    'Transport',
}

function catLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export default function KBPage() {
  const [entries, setEntries]         = useState<KBEntry[]>([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [syncById, setSyncById]       = useState<Record<string, SyncResult>>({})
  const [activeProperty, setActiveProperty] = useState('ALL')
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery]             = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await fetch(`${BRIDGE}/admin/kb/entries`)
      const d = await res.json()
      if (d.ok) setEntries(d.entries)
    } catch (_e) { toast.error('Could not load KB') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function pollStatus() {
    try {
      const res = await fetch(`${BRIDGE}/admin/kb/sync-status`)
      const d = await res.json()
      if (!d.running) {
        if (pollRef.current) clearInterval(pollRef.current)
        setSyncing(false)
        const map: Record<string, SyncResult> = {}
        for (const r of (d.results ?? [])) map[r.id] = r
        setSyncById(map)
        if (d.error) toast.error(`Sync error: ${d.error}`)
        else toast.success(`${d.updated} updated · ${d.failed} failed`)
        load()
      }
    } catch (_e) { /* ignore */ }
  }

  async function syncKB() {
    if (syncing) return
    setSyncing(true)
    setSyncById({})
    try {
      const res = await fetch(`${BRIDGE}/admin/kb/sync-links`, { method: 'POST' })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error ?? 'Failed to start sync')
      pollRef.current = setInterval(pollStatus, 3000)
    } catch (e: any) {
      toast.error(`Sync error: ${e.message}`)
      setSyncing(false)
    }
  }

  const propertyCodes = useMemo(() => {
    const codes = Array.from(new Set(entries.map(e => e.propertyCode)))
    return ['ALL', ...codes.filter(c => c !== 'ALL').sort()]
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter(e => {
      if (activeProperty !== 'ALL' && e.propertyCode !== activeProperty && e.propertyCode !== 'ALL') return false
      if (activeCategory !== 'all' && e.category !== activeCategory) return false
      if (!q) return true
      return [e.title, e.category, ...(e.triggers ?? []), ...(e.facts ?? [])].some(v => v.toLowerCase().includes(q))
    })
  }, [entries, activeProperty, activeCategory, query])

  const categoriesInView = useMemo(() => {
    const cats = Array.from(new Set(filtered.map(e => e.category)))
    const allCats = Array.from(new Set(entries.map(e => e.category))).sort()
    return allCats.filter(c => cats.includes(c))
  }, [filtered, entries])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filtered.length }
    for (const e of filtered) counts[e.category] = (counts[e.category] ?? 0) + 1
    return counts
  }, [filtered])

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Knowledge Base</h1>
          <p className="mt-1 text-[12px] text-[#6e6e73]">
            {loading ? '-' : `${entries.length} entries · ${entries.filter(e => (e.links ?? []).length > 0).length} with links`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8e8e93]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search facts, triggers..."
              className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-[#007aff]/20"
            />
          </div>
          <button onClick={syncKB} disabled={syncing}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium transition-colors touch-manipulation',
              syncing ? 'bg-[#f2f2f7] text-[#bf5af2]/60 cursor-not-allowed' : 'bg-[#f2f2f7] text-[#bf5af2] hover:bg-[#ebe5f0]',
            )}
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
            {syncing ? 'Syncing...' : 'Sync Links'}
          </button>
        </div>
      </div>

      {/* Property tabs */}
      {!loading && (
        <div className="mb-3 overflow-x-auto md:shrink-0">
          <div className="flex gap-1.5 pb-1">
            {propertyCodes.map(code => (
              <button key={code}
                onClick={() => { setActiveProperty(code); setActiveCategory('all') }}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors touch-manipulation',
                  activeProperty === code ? 'bg-[#1d1d1f] text-white' : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
                )}
              >
                {code === 'ALL' ? `All (${entries.length})` : code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category chips */}
      {!loading && categoriesInView.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 md:shrink-0">
          <button onClick={() => setActiveCategory('all')}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition-colors touch-manipulation',
              activeCategory === 'all' ? 'bg-[#007aff] text-white' : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
            )}
          >
            All ({categoryCounts.all})
          </button>
          {categoriesInView.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition-colors touch-manipulation',
                activeCategory === cat ? 'bg-[#007aff] text-white' : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
              )}
            >
              {catLabel(cat)} ({categoryCounts[cat] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 text-[#aeaeb2] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-white py-12 text-center">
          <BookOpen className="mx-auto mb-2 h-6 w-6 text-[#c7c7cc]" />
          <p className="text-[13px] text-[#8e8e93]">No entries match this filter.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map(entry => {
            const sr = syncById[entry.id]
            return (
              <article key={entry.id} className="rounded-lg border border-border bg-white">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="text-[14px] font-semibold text-[#1d1d1f]">{entry.title}</h2>
                        {entry.sensitive && (
                          <span className="rounded-[4px] bg-[#fff1f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#ff3b30]">Sensitive</span>
                        )}
                        {sr && (
                          <span className={cn('rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold',
                            sr.status === 'updated' ? 'bg-[#e8f5e9] text-[#34c759]' : 'bg-[#fff3e0] text-[#ff9500]',
                          )}>
                            {sr.status === 'updated' ? `synced (${sr.factsCount})` : sr.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-[4px] bg-[#f2f2f7] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
                          {entry.propertyCode}
                        </span>
                        <span className="text-[11px] text-[#8e8e93]">{catLabel(entry.category)}</span>
                      </div>
                    </div>
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#c7c7cc]" />
                  </div>
                </div>

                <div className="px-4 py-3">
                  {(entry.triggers ?? []).length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {(entry.triggers ?? []).slice(0, 8).map(t => (
                        <span key={t} className="rounded-[4px] bg-[#f2f2f7] px-2 py-0.5 text-[11px] text-[#6e6e73]">{t}</span>
                      ))}
                    </div>
                  )}
                  <ul className="space-y-2">
                    {(entry.facts ?? []).map((fact, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-5 text-[#1d1d1f]">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                  {(entry.links ?? []).length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-border pt-3">
                      {(entry.links ?? []).map(url => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] text-[#007aff] hover:underline truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{url}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
      </div>
    </>
  )
}
