'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import kbJson from '../../../src/knowledge/knowledge-base.json'

const kbData = kbJson as KnowledgeBase

interface KnowledgeEntry {
  id: string
  propertyCode: string
  category: string
  title: string
  triggers: string[]
  facts: string[]
  links?: string[]
  sensitive?: boolean
  source?: string
}

interface KnowledgeBase {
  version: number
  generatedAt: string
  entryCount: number
  propertyCodes: string[]
  categories: string[]
  entries: KnowledgeEntry[]
}

const CATEGORY_LABELS: Record<string, string> = {
  amenities: 'Amenities',
  checkin: 'Check-in',
  checkout: 'Check-out',
  experiences: 'Experiences',
  food: 'Food',
  'house-rules': 'House Rules',
  neighborhood: 'Neighborhood',
  payment: 'Payment',
  property: 'Property',
  safety: 'Safety',
  services: 'Services',
  transport: 'Transport',
}

function catLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

export default function KnowledgePage() {
  const [activeProperty, setActiveProperty] = useState('ALL')
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')

  const entries = kbData.entries

  // Property tabs: ALL + sorted property codes
  const propertyCodes = useMemo(() => {
    const codes = new Set(entries.map((e) => e.propertyCode))
    return ['ALL', ...Array.from(codes).filter((c) => c !== 'ALL').sort()]
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      // Property filter: ALL shows everything, specific property shows that + ALL-scope entries
      if (activeProperty !== 'ALL' && e.propertyCode !== activeProperty && e.propertyCode !== 'ALL') return false
      if (activeCategory !== 'all' && e.category !== activeCategory) return false
      if (!q) return true
      return [e.title, e.category, ...e.triggers, ...e.facts, e.source ?? ''].some((v) =>
        v.toLowerCase().includes(q),
      )
    })
  }, [entries, activeProperty, activeCategory, query])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filtered.length }
    for (const e of filtered) {
      counts[e.category] = (counts[e.category] ?? 0) + 1
    }
    return counts
  }, [filtered])

  const categoriesInView = useMemo(() => {
    const cats = new Set(filtered.map((e) => e.category))
    return kbData.categories.filter((c) => cats.has(c))
  }, [filtered])

  const propertyCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entries) {
      const key = e.propertyCode
      counts[key] = (counts[key] ?? 0) + 1
    }
    counts['ALL_TAB'] = entries.length
    return counts
  }, [entries])

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Property Knowledge Base</h1>
          <p className="mt-1 text-[12px] text-[#6e6e73]">
            {kbData.entryCount} fact groups · extracted from {kbData.propertyCodes.filter((c) => c !== 'ALL').length} properties · used for AI guest replies
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8e8e93]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search facts, triggers, properties…"
            className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-[#007aff]/20"
          />
        </div>
      </div>

      {/* Property tabs */}
      <div className="mb-4 overflow-x-auto md:shrink-0">
        <div className="flex gap-1.5 pb-1">
          {propertyCodes.map((code) => {
            const count = code === 'ALL' ? entries.length : (propertyCount[code] ?? 0)
            const isActive = activeProperty === code
            return (
              <button
                key={code}
                onClick={() => { setActiveProperty(code); setActiveCategory('all') }}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors touch-manipulation',
                  isActive
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
                )}
              >
                {code === 'ALL' ? `All (${entries.length})` : `${code} (${count})`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category chips */}
      {categoriesInView.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 md:shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition-colors touch-manipulation',
              activeCategory === 'all'
                ? 'bg-[#007aff] text-white'
                : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
            )}
          >
            All ({categoryCounts.all})
          </button>
          {categoriesInView.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition-colors touch-manipulation',
                activeCategory === cat
                  ? 'bg-[#007aff] text-white'
                  : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
              )}
            >
              {catLabel(cat)} ({categoryCounts[cat] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Entry grid */}
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      <div className="grid gap-3 xl:grid-cols-2">
        {filtered.map((entry) => (
          <article key={entry.id} className="rounded-lg border border-border bg-white">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-[14px] font-semibold text-[#1d1d1f]">{entry.title}</h2>
                    {entry.sensitive && (
                      <span className="rounded-[4px] bg-[#fff1f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#ff3b30]">
                        Sensitive
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-[4px] bg-[#f2f2f7] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
                      {entry.propertyCode}
                    </span>
                    <span className="text-[11px] text-[#8e8e93]">{catLabel(entry.category)}</span>
                    {entry.source && (
                      <span className="truncate text-[10px] text-[#c7c7cc]">{entry.source}</span>
                    )}
                  </div>
                </div>
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#c7c7cc]" />
              </div>
            </div>

            <div className="px-4 py-3">
              {/* Triggers */}
              {entry.triggers.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {entry.triggers.slice(0, 8).map((t) => (
                    <span key={t} className="rounded-[4px] bg-[#f2f2f7] px-2 py-0.5 text-[11px] text-[#6e6e73]">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Facts */}
              <ul className="space-y-2">
                {entry.facts.map((fact, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-5 text-[#1d1d1f]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>

              {/* Links */}
              {(entry.links ?? []).length > 0 && (
                <div className="mt-3 space-y-1 border-t border-border pt-3">
                  {(entry.links ?? []).map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[11px] text-[#007aff] hover:underline"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-white py-12 text-center">
          <BookOpen className="mx-auto mb-2 h-6 w-6 text-[#c7c7cc]" />
          <p className="text-[13px] text-[#8e8e93]">No knowledge entries match this filter.</p>
        </div>
      )}
      </div>
    </>
  )
}
