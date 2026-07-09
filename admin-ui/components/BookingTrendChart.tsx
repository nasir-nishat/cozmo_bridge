'use client'

import { useMemo, useRef, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { AnalyticsDay } from '@/lib/types'

const GOOD = '#0ca30c'
const CRITICAL = '#d03b3b'

const VB_W = 800
const VB_H = 280
const PAD = { top: 16, right: 16, bottom: 26, left: 34 }
const INNER_W = VB_W - PAD.left - PAD.right
const INNER_H = VB_H - PAD.top - PAD.bottom

function niceCeil(value: number): number {
  if (value <= 4) return 4
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]
  for (const s of steps) if (value <= s) return s
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / magnitude) * magnitude
}

function fmtDate(dateKey: string, withDay = true): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  return d.toLocaleDateString('en-US', withDay
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export default function BookingTrendChart({ days, loading }: { days: AnalyticsDay[]; loading: boolean }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const yMax = useMemo(() => {
    const m = Math.max(0, ...days.map(d => Math.max(d.newCount, d.cancelledCount)))
    return niceCeil(m)
  }, [days])

  const n = days.length
  const xAt = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * INNER_W)
  const yAt = (v: number) => PAD.top + INNER_H - (v / yMax) * INNER_H

  const newPath = useMemo(() => days.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(d.newCount)}`).join(' '), [days, yMax])
  const cancelPath = useMemo(() => days.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(d.cancelledCount)}`).join(' '), [days, yMax])
  const newArea = n > 0 ? `${newPath} L${xAt(n - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z` : ''

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(yMax * f))
  const xTickIdx = useMemo(() => {
    if (n <= 1) return [0]
    const count = Math.min(6, n)
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (n - 1)))
  }, [n])

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || n === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const xInVb = ((e.clientX - rect.left) / rect.width) * VB_W
    const ratio = Math.min(1, Math.max(0, (xInVb - PAD.left) / INNER_W))
    setHoverIdx(Math.round(ratio * (n - 1)))
  }

  const hovered = hoverIdx !== null ? days[hoverIdx] : null
  const last = days[n - 1]
  const spansYears = n > 400

  return (
    <div className="viz-analytics bg-white rounded-lg border border-border p-4">
      {/* Legend + table toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="flex items-center gap-1.5 text-[#6e6e73]">
            <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: GOOD }} />
            New
          </span>
          <span className="flex items-center gap-1.5 text-[#6e6e73]">
            <svg width="12" height="2"><line x1="0" y1="1" x2="12" y2="1" stroke={CRITICAL} strokeWidth="2" strokeDasharray="3,2" /></svg>
            Cancelled
          </span>
        </div>
        <button onClick={() => setShowTable(v => !v)}
          className="text-[11px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors touch-manipulation"
        >
          {showTable ? 'Show chart' : 'Table view'}
        </button>
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-[13px] text-[#8e8e93]">Loading…</div>
      ) : n === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[13px] text-[#8e8e93]">No data in range.</div>
      ) : showTable ? (
        <div className="max-h-[280px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>New</TableHead><TableHead>Cancelled</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {[...days].reverse().filter(d => d.newCount || d.cancelledCount).map(d => (
                <TableRow key={d.date}>
                  <TableCell className="text-sm">{d.date}</TableCell>
                  <TableCell className="tabular-nums text-sm">{d.newCount}</TableCell>
                  <TableCell className="tabular-nums text-sm">{d.cancelledCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="relative">
          <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-[280px] touch-none"
            onPointerMove={handleMove} onPointerLeave={() => setHoverIdx(null)}
          >
            {/* gridlines */}
            {yTicks.map(t => (
              <g key={t}>
                <line x1={PAD.left} x2={VB_W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--viz-grid)" strokeWidth="1" />
                <text x={PAD.left - 6} y={yAt(t) + 3} textAnchor="end" fontSize="10" fill="var(--viz-muted)">{t}</text>
              </g>
            ))}
            {/* x labels */}
            {xTickIdx.map(i => (
              <text key={i} x={xAt(i)} y={VB_H - 6} textAnchor="middle" fontSize="10" fill="var(--viz-muted)">
                {fmtDate(days[i].date, !spansYears)}
              </text>
            ))}

            {/* area + lines */}
            <path d={newArea} fill={GOOD} opacity="0.1" stroke="none" />
            <path d={newPath} fill="none" stroke={GOOD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={cancelPath} fill="none" stroke={CRITICAL} strokeWidth="2" strokeDasharray="6,4" strokeLinejoin="round" strokeLinecap="round" />

            {/* end markers + direct labels */}
            <circle cx={xAt(n - 1)} cy={yAt(last.newCount)} r="4" fill={GOOD} stroke="var(--viz-surface)" strokeWidth="2" />
            <text x={xAt(n - 1) - 6} y={yAt(last.newCount) - 8} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--viz-text)">{last.newCount}</text>
            <circle cx={xAt(n - 1)} cy={yAt(last.cancelledCount)} r="4" fill={CRITICAL} stroke="var(--viz-surface)" strokeWidth="2" />
            <text x={xAt(n - 1) - 6} y={yAt(last.cancelledCount) + 14} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--viz-text)">{last.cancelledCount}</text>

            {/* crosshair */}
            {hoverIdx !== null && (
              <>
                <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PAD.top} y2={VB_H - PAD.bottom} stroke="var(--viz-muted)" strokeWidth="1" />
                <circle cx={xAt(hoverIdx)} cy={yAt(days[hoverIdx].newCount)} r="4" fill={GOOD} stroke="var(--viz-surface)" strokeWidth="2" />
                <circle cx={xAt(hoverIdx)} cy={yAt(days[hoverIdx].cancelledCount)} r="4" fill={CRITICAL} stroke="var(--viz-surface)" strokeWidth="2" />
              </>
            )}
          </svg>

          {hovered && (
            <div
              className="absolute top-2 pointer-events-none rounded-md border border-border bg-white px-2.5 py-1.5 text-[11px] shadow-sm"
              style={{
                left: `${Math.min(85, Math.max(2, (xAt(hoverIdx!) / VB_W) * 100))}%`,
                transform: (xAt(hoverIdx!) / VB_W) > 0.7 ? 'translateX(-100%)' : undefined,
              }}
            >
              <p className="font-semibold text-[#1d1d1f] mb-1">{hovered.date}</p>
              <p className="flex items-center gap-1.5 text-[#6e6e73]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: GOOD }} />
                New <span className="font-semibold text-[#1d1d1f] ml-auto">{hovered.newCount}</span>
              </p>
              <p className="flex items-center gap-1.5 text-[#6e6e73]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: CRITICAL }} />
                Cancelled <span className="font-semibold text-[#1d1d1f] ml-auto">{hovered.cancelledCount}</span>
              </p>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .viz-analytics {
          --viz-grid: #e1e0d9;
          --viz-muted: #898781;
          --viz-text: #0b0b0b;
          --viz-surface: #ffffff;
        }
        :global(.admin-dark) .viz-analytics {
          --viz-grid: #30333a;
          --viz-muted: #a9a39a;
          --viz-text: #f3eadb;
          --viz-surface: #17191d;
        }
      `}</style>
    </div>
  )
}
