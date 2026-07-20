'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2, Clock, Hammer, PackageCheck, Hourglass } from 'lucide-react'

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

// Minutes after build start when each stage typically happens (midpoint of the randomized delays)
const STEP_ETA_MIN: Record<string, number> = {
  create: 0, settings: 3, stabilize: 7, admins: 11, link: 14, welcome: 27, icon: 38,
}
const BUILD_TOTAL_MIN = 40 // group fully ready ≈ 40 min after build starts

function fmtTime(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
}
function fmtDT(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
}
function addMin(iso: string, min: number) {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString()
}
function isToday(iso?: string | null) {
  if (!iso) return false
  const kst = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  return kst(new Date(iso)) === kst(new Date())
}

const BADGE: Record<Build['status'], { text: string; color: string; bg: string }> = {
  building: { text: 'In progress', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  done:     { text: 'Delivered',   color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
  failed:   { text: 'Failed',      color: '#b91c1c', bg: 'rgba(185,28,28,0.1)' },
}

function StepDot({ s }: { s: StepState['status'] }) {
  const base: React.CSSProperties = { width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }
  if (s === 'done') return <span style={{ ...base, background: 'rgba(21,128,61,0.12)' }}><CheckCircle2 size={15} color="#15803d" /></span>
  if (s === 'warn') return <span style={{ ...base, background: 'rgba(180,83,9,0.12)' }}><AlertTriangle size={14} color="#b45309" /></span>
  if (s === 'active') return <span style={{ ...base, background: 'rgba(37,99,235,0.12)' }}><Loader2 size={14} color="#2563eb" className="animate-spin" /></span>
  return <span style={{ ...base, border: '2px solid var(--border, #ddd)' }} />
}

export default function GroupBuildsPage() {
  const [plan, setPlan] = useState<PlanStep[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [queue, setQueue] = useState<QueueJob[]>([])
  const [pacing, setPacing] = useState<Pacing | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHow, setShowHow] = useState(false)

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
  const doneToday = builds.filter(b => b.status === 'done' && isToday(b.finishedAt))
  const failedRecent = builds.filter(b => b.status === 'failed' && isToday(b.finishedAt))
  const recent = builds.filter(b => b.status !== 'building').slice(0, 8)

  const card: React.CSSProperties = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, padding: '0.9rem 1.1rem' }
  const statNum: React.CSSProperties = { fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.1 }
  const statLabel: React.CSSProperties = { fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Group Builds</h1>
        <button onClick={load} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--border, #ddd)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <p style={{ opacity: 0.65, margin: '0 0 1rem', fontSize: '0.85rem', maxWidth: 720 }}>
        When a guest books, COZMO builds their WhatsApp group automatically — like a delivery, in stages:
        <b> Waiting → Building (~40 min) → Delivered</b>. It's deliberately slow and randomized so WhatsApp
        sees human behavior, not a bot (that protects our number from bans).
      </p>

      {/* Status counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={card}>
          <div style={{ ...statNum, color: '#b45309' }}>{queue.length}</div>
          <div style={statLabel}><Hourglass size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Waiting for slot</div>
        </div>
        <div style={card}>
          <div style={{ ...statNum, color: '#2563eb' }}>{active.length}</div>
          <div style={statLabel}><Hammer size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Building now</div>
        </div>
        <div style={card}>
          <div style={{ ...statNum, color: '#15803d' }}>{doneToday.length}</div>
          <div style={statLabel}><PackageCheck size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Delivered today</div>
        </div>
        <div style={card}>
          <div style={{ ...statNum, color: failedRecent.length ? '#b91c1c' : 'inherit' }}>{failedRecent.length}</div>
          <div style={statLabel}>Failed today</div>
        </div>
        <div style={card}>
          <div style={statNum}>{pacing ? `${pacing.todayCount}/${pacing.dailyCap}` : '–'}</div>
          <div style={statLabel}>Daily limit used</div>
        </div>
      </div>

      {/* Gate strip */}
      {pacing && (
        <div style={{ ...card, display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          <Clock size={15} style={{ opacity: 0.6 }} />
          {pacing.canCreateNow ? (
            <span><b style={{ color: '#15803d' }}>Ready to build.</b> The next queued group starts on the next check (within ~2 min).</span>
          ) : (
            <span>
              <b style={{ color: '#b45309' }}>Paused: {pacing.holdReason}.</b>{' '}
              Next build can start <b>{fmtDT(pacing.nextEligibleAt)}</b>.
            </span>
          )}
          <span style={{ opacity: 0.55 }}>· one group every {pacing.minGapMinutes} min · max {pacing.dailyCap}/day · builds run {pacing.activeHours}</span>
        </div>
      )}

      {/* Queue as delivery stages */}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>🕐 Waiting for a build slot ({queue.length})</h2>
      {queue.length === 0 ? (
        <p style={{ opacity: 0.55, fontSize: '0.85rem', margin: '0 0 1.5rem' }}>Nothing waiting. New bookings appear here automatically, then move to "Building" when their slot opens.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, marginBottom: '1.5rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--muted, #fafafa)' }}>
                <th style={{ padding: '0.55rem 0.8rem' }}>Guest</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Property</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Check-in</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Build starts</th>
                <th style={{ padding: '0.55rem 0.8rem' }}>Group ready by</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(j => (
                <tr key={j.leadUid} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600 }}>{j.guestName}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>{j.property}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>{j.checkIn || 'TBD'}</td>
                  <td style={{ padding: '0.5rem 0.8rem' }}>~{fmtDT(j.eta)}</td>
                  <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600 }}>~{fmtDT(addMin(j.eta, BUILD_TOTAL_MIN))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Builds as tracking timelines */}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        🔨 Builds {active.length > 0 && <span style={{ color: '#2563eb' }}>· {active.length} running now</span>}
      </h2>
      {builds.length === 0 ? (
        <p style={{ opacity: 0.55, fontSize: '0.85rem', margin: '0 0 1.5rem' }}>No builds tracked yet — the next group COZMO creates will appear here with its live timeline.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[...active, ...recent].map(b => {
            const badge = BADGE[b.status]
            const doneSteps = plan.filter(p => (b.steps[p.key]?.status === 'done')).length
            return (
              <div key={`${b.leadUid}-${b.startedAt}`} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700 }}>{b.groupName || `${b.guestName} @ ${b.property}`}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 999, padding: '0.15rem 0.6rem' }}>{badge.text}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.55 }}>
                    {doneSteps}/{plan.length} stages · started {fmtDT(b.startedAt)}
                    {b.status === 'building' && <> · ready by ~<b>{fmtTime(addMin(b.startedAt, BUILD_TOTAL_MIN))}</b></>}
                    {b.finishedAt && b.status === 'done' && <> · finished {fmtTime(b.finishedAt)}</>}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  {/* vertical connector */}
                  <div style={{ position: 'absolute', left: 10, top: 10, bottom: 10, width: 2, background: 'var(--border, #eee)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {plan.map(p => {
                      const st = b.steps[p.key] || { status: 'pending' as const }
                      const eta = STEP_ETA_MIN[p.key] != null ? addMin(b.startedAt, STEP_ETA_MIN[p.key]) : null
                      return (
                        <div key={p.key} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', fontSize: '0.83rem' }}>
                          <StepDot s={st.status} />
                          <div style={{ paddingTop: 2, minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{p.label}</span>
                            <span style={{ opacity: 0.7, marginLeft: 8 }}>
                              {st.status === 'done' && <span style={{ color: '#15803d' }}>done {fmtTime(st.at)}{st.note ? ` · ${st.note}` : ''}</span>}
                              {st.status === 'warn' && <span style={{ color: '#b45309' }}>{st.note || 'needs attention'} · {fmtTime(st.at)}</span>}
                              {st.status === 'active' && <span style={{ color: '#2563eb' }}>happening now — {st.note || p.expect}</span>}
                              {st.status === 'pending' && b.status === 'building' && eta && <span>up next ~{fmtTime(eta)} · {p.expect}</span>}
                              {st.status === 'pending' && b.status !== 'building' && <span style={{ opacity: 0.6 }}>—</span>}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Collapsible explainer */}
      <button onClick={() => setShowHow(v => !v)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, color: 'inherit', marginBottom: '0.5rem' }}>
        {showHow ? '▾' : '▸'} How does a build work? (tap to {showHow ? 'hide' : 'learn'})
      </button>
      {showHow && (
        <div style={{ ...card, fontSize: '0.83rem' }}>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {plan.map(p => (
              <li key={p.key}><b>{p.label}</b> — {p.expect}</li>
            ))}
          </ol>
          <p style={{ margin: '0.7rem 0 0', opacity: 0.65 }}>
            A full build takes ≈ 30–45 min. The pauses are randomized on purpose so WhatsApp reads it as human
            activity — please don't re-run <code>/group</code> while a build is in progress, and don't worry about
            the quiet gaps. If you send a step manually, COZMO notices and won't double-send.
          </p>
        </div>
      )}
    </div>
  )
}
