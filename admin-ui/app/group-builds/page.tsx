'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Circle, Loader2, Clock, Hammer } from 'lucide-react'

const BRIDGE = '/api/bridge'

type PlanStep = { key: string; label: string; expect: string }
type StepState = { status: 'pending' | 'active' | 'done' | 'warn'; at?: string; note?: string }

type Build = {
  leadUid: string
  guestName: string
  property: string
  groupName: string
  groupId: string | null
  status: 'building' | 'done' | 'failed'
  startedAt: string
  finishedAt: string | null
  steps: Record<string, StepState | undefined>
}

type QueueJob = {
  leadUid: string
  guestName: string
  property: string
  checkIn: string
  eta: string
}

type Pacing = {
  todayCount: number
  dailyCap: number
  minGapMinutes: number
  activeHours: string
  canCreateNow: boolean
  holdReason: string | null
  nextEligibleAt: string
}

function fmt(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
  })
}

function StatusIcon({ s }: { s: StepState['status'] }) {
  if (s === 'done') return <CheckCircle2 size={16} color="#15803d" />
  if (s === 'warn') return <AlertTriangle size={16} color="#b45309" />
  if (s === 'active') return <Loader2 size={16} color="#2563eb" className="animate-spin" />
  return <Circle size={16} style={{ opacity: 0.25 }} />
}

const BADGE: Record<Build['status'], { text: string; color: string; bg: string }> = {
  building: { text: 'Building', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  done:     { text: 'Done',     color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
  failed:   { text: 'Failed',   color: '#b91c1c', bg: 'rgba(185,28,28,0.1)' },
}

export default function GroupBuildsPage() {
  const [plan, setPlan] = useState<PlanStep[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [queue, setQueue] = useState<QueueJob[]>([])
  const [pacing, setPacing] = useState<Pacing | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/group-builds`)
      const data = await res.json()
      if (data.ok) {
        setPlan(data.plan)
        setBuilds(data.builds)
        setQueue(data.queue)
        setPacing(data.pacing)
      }
    } catch { /* bridge offline */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  const active = builds.filter(b => b.status === 'building')
  const recent = builds.filter(b => b.status !== 'building').slice(0, 10)

  const card: React.CSSProperties = {
    border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, padding: '0.9rem 1.1rem',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Group Builds</h1>
          <p style={{ opacity: 0.6, margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Live WhatsApp group-creation pipeline. Builds are slow-paced <b>on purpose</b> — ban protection, not a bug.
          </p>
        </div>
        <button onClick={load} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--border, #ddd)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Pacing gate */}
      {pacing && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={card}>
            <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Today</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{pacing.todayCount} / {pacing.dailyCap} groups</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gate</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: pacing.canCreateNow ? '#15803d' : '#b45309' }}>
              {pacing.canCreateNow ? 'Open — next group can build' : `Holding — ${pacing.holdReason}`}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next slot</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={14} /> {fmt(pacing.nextEligibleAt)}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rules</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>{pacing.minGapMinutes} min between groups · {pacing.activeHours}</div>
          </div>
        </div>
      )}

      {/* Queue */}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Waiting in queue ({queue.length})</h2>
      {queue.length === 0 ? (
        <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: 0 }}>Nothing queued — new bookings appear here until their build slot opens.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, marginBottom: '1.25rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--muted, #fafafa)' }}>
                <th style={{ padding: '0.55rem 0.8rem' }}>Guest</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Property</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Check-in</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Build expected</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(j => (
                <tr key={j.leadUid} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600 }}>{j.guestName}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>{j.property}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>{j.checkIn || 'TBD'}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>~{fmt(j.eta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active + recent builds */}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        Builds {active.length > 0 && <span style={{ color: '#2563eb' }}>· {active.length} in progress</span>}
      </h2>
      {builds.length === 0 ? (
        <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: 0 }}>No builds recorded yet (tracking starts with the next group creation).</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[...active, ...recent].map(b => {
            const badge = BADGE[b.status]
            return (
              <div key={`${b.leadUid}-${b.startedAt}`} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <Hammer size={15} style={{ opacity: 0.5 }} />
                  <span style={{ fontWeight: 700 }}>{b.groupName || `${b.guestName} @ ${b.property}`}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 999, padding: '0.15rem 0.6rem' }}>{badge.text}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.55 }}>started {fmt(b.startedAt)}{b.finishedAt ? ` · finished ${fmt(b.finishedAt)}` : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {plan.map(p => {
                    const st = b.steps[p.key] || { status: 'pending' as const }
                    return (
                      <div key={p.key} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', fontSize: '0.83rem' }}>
                        <span style={{ marginTop: 1 }}><StatusIcon s={st.status} /></span>
                        <span style={{ fontWeight: 600, minWidth: 130 }}>{p.label}</span>
                        <span style={{ opacity: 0.7 }}>
                          {st.status === 'done' && <>done {fmt(st.at)}{st.note ? ` · ${st.note}` : ''}</>}
                          {st.status === 'warn' && <span style={{ color: '#b45309' }}>{st.note || 'needs attention'} · {fmt(st.at)}</span>}
                          {st.status === 'active' && <span style={{ color: '#2563eb' }}>{st.note || p.expect}</span>}
                          {st.status === 'pending' && <span style={{ opacity: 0.75 }}>{p.expect}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Static explainer */}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>How a group gets built</h2>
      <div style={{ ...card, fontSize: '0.83rem' }}>
        <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {plan.map(p => (
            <li key={p.key}><b>{p.label}</b> — {p.expect}</li>
          ))}
        </ol>
        <p style={{ margin: '0.7rem 0 0', opacity: 0.6 }}>
          Full build ≈ 30–45 min end to end. The delays are randomized anti-ban pacing — do not re-run <code>/group</code> while a build is in progress; if you paste a message manually, COZMO detects it and won&apos;t double-send.
        </p>
      </div>
    </div>
  )
}
