'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  CheckCircle2, Bug, Sprout, Zap, ArrowRight, MessageCircle, Wind,
  Plus, Sparkles, X, Loader2, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PropertyTask, TaskStatus, TaskType } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM = ['Mei', 'Jisu', 'Nari', 'Minho']

const PROPERTIES = [
  'Joy of TEVA', 'Teva Retreat', 'Teva Wellness', 'Teva Aeris Garden',
  'Seongbuk Achae', 'Secret Garden', 'Breeze & Sunrise', 'Leeha',
  'Kelly Luxury', 'Kelly Ananda', 'Kelly Prana',
  'Yeonnam Lotus', 'Yeonnam Fish', 'Yeonnam Bird',
]

const TYPE_META: Record<TaskType, { label: string; Icon: LucideIcon; bg: string; color: string }> = {
  guest_request:  { label: 'Guest Request',  Icon: MessageCircle, bg: '#fff0f3', color: '#ff2d55' },
  pest_control:   { label: 'Pest Control',   Icon: Bug,           bg: '#fff3e0', color: '#ff9500' },
  plant_watering: { label: 'Plant Watering', Icon: Sprout,        bg: '#e8f5e9', color: '#34c759' },
  cleaning:       { label: 'Cleaning',       Icon: Wind,          bg: '#e8f4fd', color: '#5ac8fa' },
  iot:            { label: 'IoT',            Icon: Zap,           bg: '#e8f0fe', color: '#007aff' },
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'new',   label: 'New'   },
  { key: 'doing', label: 'Doing' },
  { key: 'done',  label: 'Done'  },
]

const BRIDGE = '/api/bridge'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

async function patchTask(id: string, patch: Record<string, unknown>) {
  const res = await fetch(`${BRIDGE}/admin/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Failed to update task')
}

// ── Card body ────────────────────────────────────────────────────────────────

function CardBody({ task }: { task: PropertyTask }) {
  const meta = TYPE_META[task.type] ?? TYPE_META.iot
  const { Icon, label, bg, color } = meta
  return (
    <div className="flex gap-3 px-3.5 pt-3.5 pb-3">
      <div className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center mt-0.5"
        style={{ backgroundColor: bg }} aria-hidden="true">
        <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <p className="text-[14px] font-semibold text-[#1d1d1f] leading-snug">{task.property}</p>
          {task.source === 'ai' && (
            <Sparkles className="shrink-0 h-3 w-3 text-[#bf5af2] mt-0.5" aria-hidden="true" />
          )}
        </div>
        {task.guestName && (
          <p className="text-[11px] text-[#bf5af2] font-medium mb-0.5">{task.guestName}</p>
        )}
        <p className="text-[12px] text-[#3a3a3c] leading-snug">{task.title}</p>
        <p className="mt-1.5 text-[11px] text-[#aeaeb2]">
          {task.assignee && <>{task.assignee} · </>}{label} · {ago(task.updatedAt)}
        </p>
      </div>
    </div>
  )
}

// ── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onStart, onDone, isDragging = false }: {
  task: PropertyTask
  onStart: (id: string) => void
  onDone: (id: string) => void
  isDragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className={cn(
        'bg-white rounded-lg border border-border overflow-hidden touch-manipulation',
        isDragging && 'opacity-40',
      )}
    >
      <div {...listeners} {...attributes}
        className="cursor-grab active:cursor-grabbing select-none"
        aria-label={`Drag ${task.property} task`}
      >
        <CardBody task={task} />
      </div>

      <div className="mx-3.5 h-px bg-border" />

      {task.status === 'new' && (
        <button onClick={() => onStart(task.id)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-[13px] font-medium text-[#007aff] hover:bg-[rgba(0,122,255,0.05)] active:bg-[rgba(0,122,255,0.1)] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#007aff]/40"
        >
          {task.assignee ? 'Start' : 'Claim & Start'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {task.status === 'doing' && (
        <button onClick={() => onDone(task.id)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-[13px] font-medium text-[#34c759] hover:bg-[rgba(52,199,89,0.05)] active:bg-[rgba(52,199,89,0.1)] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#34c759]/40"
        >
          Mark Done
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {task.status === 'done' && (
        <div className="px-3.5 py-2 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-[#34c759]" aria-hidden="true" />
          <span className="text-[11px] text-[#aeaeb2]">Done</span>
        </div>
      )}
    </div>
  )
}

// ── Column ───────────────────────────────────────────────────────────────────

function Column({ col, tasks, activeId, onStart, onDone }: {
  col: typeof COLUMNS[number]
  tasks: PropertyTask[]
  activeId: string | null
  onStart: (id: string) => void
  onDone: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })

  return (
    <section aria-label={col.label} className="md:h-full md:flex md:flex-col md:min-h-0">
      <div className="flex items-baseline justify-between mb-2.5 px-0.5 md:shrink-0">
        <h2 className="text-[14px] font-semibold text-[#1d1d1f]">{col.label}</h2>
        <span className="text-[14px] font-semibold text-[#aeaeb2] tabular-nums">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'space-y-2 min-h-[40px] rounded-lg transition-all duration-150 p-1 -m-1 md:flex-1 md:min-h-0 md:overflow-y-auto',
          isOver && 'ring-2 ring-[#007aff]/25 bg-[rgba(0,122,255,0.03)]',
        )}
      >
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} isDragging={task.id === activeId}
            onStart={onStart} onDone={onDone} />
        ))}
        {tasks.length === 0 && (
          <p className="py-6 text-center text-[12px] text-[#c7c7cc]">—</p>
        )}
      </div>
    </section>
  )
}

// ── Create modal ─────────────────────────────────────────────────────────────

const BLANK = { property: '', title: '', type: 'guest_request' as TaskType, assignee: '' }

function CreateModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (t: PropertyTask) => void
}) {
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.property.trim() || !form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: form.property.trim(),
          title: form.title.trim(),
          type: form.type,
          assignee: form.assignee || null,
          source: 'jandi',
          notes: '',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed')
      onAdd(data.task)
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full text-[15px] text-[#1d1d1f] placeholder:text-[#c7c7cc] bg-transparent focus:outline-none'

  const TYPE_OPTIONS: TaskType[] = ['guest_request', 'pest_control', 'plant_watering', 'cleaning']

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Create task"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[6px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[340px] mx-4 bg-white rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">New Task</h2>
          <button onClick={onClose} aria-label="Close"
            className="w-6 h-6 rounded flex items-center justify-center text-[#6e6e73] hover:bg-[#f2f2f7] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f]/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="divide-y divide-border">
            <div className="px-4 py-3">
              <label htmlFor="cp" className="block text-[10px] font-semibold text-[#6e6e73] uppercase tracking-wide mb-1">Property</label>
              <input id="cp" list="cp-list" autoComplete="off" required
                value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))}
                placeholder="Joy of TEVA…"
                className={inputCls}
              />
              <datalist id="cp-list">{PROPERTIES.map(p => <option key={p} value={p} />)}</datalist>
            </div>

            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-[#6e6e73] uppercase tracking-wide mb-2">Type</p>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(t => {
                  const m = TYPE_META[t]
                  const active = form.type === t
                  return (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-colors touch-manipulation border',
                        active ? 'border-border bg-[#f2f2f7]' : 'border-transparent text-[#6e6e73]',
                      )}
                      style={active ? { color: m.color } : undefined}
                    >
                      <m.Icon className="h-3.5 w-3.5" aria-hidden="true" style={active ? { color: m.color } : undefined} />
                      {m.label.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-4 py-3">
              <label htmlFor="ct" className="block text-[10px] font-semibold text-[#6e6e73] uppercase tracking-wide mb-1">Task</label>
              <input id="ct" required
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Describe the work…"
                className={inputCls}
              />
            </div>

            <div className="px-4 py-3">
              <label htmlFor="ca" className="block text-[10px] font-semibold text-[#6e6e73] uppercase tracking-wide mb-1">Assignee</label>
              <select id="ca"
                value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                className={cn(inputCls, 'appearance-none')}
              >
                <option value="">Unassigned</option>
                {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 px-4 py-3 border-t border-border">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-md text-[14px] font-medium text-[#6e6e73] border border-border hover:bg-[#f2f2f7] transition-colors touch-manipulation"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-md text-[14px] font-semibold text-white bg-[#007aff] hover:bg-[#0071e3] active:bg-[#0062c4] transition-colors touch-manipulation disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActionBoardPage() {
  const [tasks, setTasks] = useState<PropertyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [mobileCol, setMobileCol] = useState<TaskStatus>('new')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    fetch(`${BRIDGE}/admin/tasks`)
      .then(r => r.json())
      .then(d => { if (d.ok) setTasks(d.tasks) })
      .catch(() => toast.error('Could not load tasks'))
      .finally(() => setLoading(false))
  }, [])

  const applyPatch = useCallback((id: string, patch: Partial<PropertyTask>) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)), [])

  async function changeStatus(id: string, status: TaskStatus) {
    applyPatch(id, { status })
    try { await patchTask(id, { status }) }
    catch { toast.error('Failed to save'); applyPatch(id, { status: tasks.find(t => t.id === id)?.status ?? 'new' }) }
  }

  function handleDragStart({ active }: DragStartEvent) { setActiveId(active.id as string) }
  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const s = over.id as TaskStatus
    if (!['new', 'doing', 'done'].includes(s)) return
    const task = tasks.find(t => t.id === active.id)
    if (task && task.status !== s) changeStatus(active.id as string, s)
  }

  const activeTask = tasks.find(t => t.id === activeId) ?? null
  const colTasks = (key: TaskStatus) => tasks.filter(t => t.status === key)

  const openCount = tasks.filter(t => t.status !== 'done').length
  const unassigned = tasks.filter(t => t.status !== 'done' && !t.assignee).length

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Header */}
        <div className="flex items-center justify-between mb-1 md:shrink-0">
          <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Action Board</h1>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-medium bg-[#007aff] text-white hover:bg-[#0071e3] active:bg-[#0062c4] transition-colors touch-manipulation"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            New
          </button>
        </div>

        {/* Summary line */}
        {!loading && (
          <p className="text-[12px] text-[#aeaeb2] mb-4 md:shrink-0">
            {openCount} open
            {unassigned > 0 && <> · <span className="text-[#ff9500]">{unassigned} unassigned</span></>}
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-[#aeaeb2] animate-spin" />
          </div>
        )}

        {!loading && (
          <>
            {/* Mobile: column tabs */}
            <div className="flex gap-1.5 mb-3 md:hidden">
              {COLUMNS.map(col => {
                const count = colTasks(col.key).length
                return (
                  <button key={col.key} onClick={() => setMobileCol(col.key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-medium transition-colors touch-manipulation border',
                      mobileCol === col.key
                        ? 'bg-[#1d1d1f] text-white border-transparent'
                        : 'bg-white text-[#6e6e73] border-border',
                    )}
                  >
                    {col.label}
                    <span className={cn('text-[11px] tabular-nums', mobileCol === col.key ? 'text-white/60' : 'text-[#aeaeb2]')}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Mobile: single column */}
            <div className="md:hidden">
              {COLUMNS.filter(c => c.key === mobileCol).map(col => (
                <Column key={col.key} col={col}
                  tasks={colTasks(col.key)}
                  activeId={activeId}
                  onStart={id => changeStatus(id, 'doing')}
                  onDone={id => changeStatus(id, 'done')}
                />
              ))}
            </div>

            {/* Desktop: 3-column kanban */}
            <div className="hidden md:grid grid-cols-3 gap-5 md:flex-1 md:min-h-0">
              {COLUMNS.map(col => (
                <Column key={col.key} col={col}
                  tasks={colTasks(col.key)}
                  activeId={activeId}
                  onStart={id => changeStatus(id, 'doing')}
                  onDone={id => changeStatus(id, 'done')}
                />
              ))}
            </div>
          </>
        )}

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="bg-white rounded-lg border border-border shadow-md rotate-1 scale-[1.02] overflow-hidden">
              <CardBody task={activeTask} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onAdd={task => setTasks(prev => [task, ...prev])}
        />
      )}
    </>
  )
}
