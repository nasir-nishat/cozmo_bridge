'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Bot, User2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BRIDGE = '/api/bridge'

type Step = {
  type: string
  label: string
  done: boolean
  by: 'cozmo' | 'team' | null
  at: string | null
}

type GroupSteps = {
  groupId: string
  leadUid: string
  name: string | null
  checkIn: string | null
  checkOut: string | null
  steps: Step[]
  progress: string
}

function fmtStay(checkIn: string | null, checkOut: string | null) {
  if (!checkIn) return ''
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return checkOut ? `${f(checkIn)} – ${f(checkOut)}` : f(checkIn)
}

function shortName(name: string | null, id: string) {
  if (!name) return id.replace(/@g\.us$/, '')
  return name.replace(/^COZE\s+/, '')
}

function fmt(at: string | null) {
  if (!at) return ''
  return new Date(at).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
  })
}

export default function ChecklistPage() {
  const [groups, setGroups] = useState<GroupSteps[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyOpen, setOnlyOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/group-steps`)
      const data = await res.json()
      if (data.ok) setGroups(data.groups)
    } catch { /* bridge offline */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // refresh every minute so team-completed steps appear
    return () => clearInterval(t)
  }, [])

  const labels = groups[0]?.steps.map(s => s.label) ?? []
  const shown = onlyOpen
    ? groups.filter(g => g.steps.some(s => !s.done))
    : groups

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Guest Checklist</h1>
          <p style={{ opacity: 0.6, margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Per-group lifecycle steps. <Bot size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> = COZMO sent it &nbsp;·&nbsp;
            <User2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> = team handled it (auto-detected)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', gap: '0.35rem', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
            Only incomplete
          </label>
          <button onClick={load} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--border, #ddd)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loading && groups.length === 0 ? (
        <p style={{ opacity: 0.6 }}>Loading…</p>
      ) : shown.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No WhatsApp groups yet.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--muted, #fafafa)' }}>
                <th style={{ padding: '0.6rem 0.8rem', position: 'sticky', left: 0, background: 'var(--muted, #fafafa)' }}>Group</th>
                <th style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>Stay</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Done</th>
                {labels.map(l => (
                  <th key={l} style={{ padding: '0.6rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(g => (
                <tr key={g.groupId} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '0.5rem 0.8rem', position: 'sticky', left: 0, background: 'var(--bg, #fff)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {shortName(g.name, g.groupId)}
                  </td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', opacity: 0.7 }}>{fmtStay(g.checkIn, g.checkOut)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', opacity: 0.7, whiteSpace: 'nowrap' }}>{g.progress}</td>
                  {g.steps.map(s => (
                    <td key={s.type} style={{ padding: '0.5rem', textAlign: 'center' }} title={s.done ? `${s.by === 'team' ? 'Team' : 'COZMO'} · ${fmt(s.at)}` : 'Not done yet'}>
                      {s.done ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          color: s.by === 'team' ? '#b45309' : '#15803d', fontWeight: 600,
                        }}>
                          {s.by === 'team' ? <User2 size={14} /> : <Bot size={14} />}✓
                        </span>
                      ) : (
                        <span style={{ opacity: 0.25 }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
