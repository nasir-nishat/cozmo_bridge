import Link from 'next/link'
import ColCard from './ColCard'
import type { PropertyTask } from '@/lib/types'

const STATUS_STYLE: Record<string, string> = {
  new:   'bg-[#F1EEE3] text-[#5C4E3D]',
  doing: 'bg-[#FEF9C3] text-[#854D0E]',
  done:  'bg-[#DCFCE7] text-[#166534]',
}
const STATUS_LABEL: Record<string, string> = { new: 'New', doing: 'Doing', done: 'Done' }

export default function TasksCol({
  tasks,
  label = 'Tasks',
  emptyState = 'All clear',
  actionHref = '/ops',
  actionLabel = 'View all',
}: {
  tasks: PropertyTask[]
  label?: string
  emptyState?: string
  actionHref?: string | null
  actionLabel?: string
}) {
  const open = tasks.filter(t => t.status !== 'done')

  const byProperty = open.reduce<Record<string, PropertyTask[]>>((acc, t) => {
    const key = t.property || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <ColCard
      label={label}
      count={open.length}
      action={actionHref ? (
        <Link href={actionHref} className="text-[11px] text-[#B88E23] font-medium hover:text-[#856949] transition-colors">
          {actionLabel}
        </Link>
      ) : undefined}
    >
      {open.length === 0 ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">{emptyState}</p>
      ) : (
        <div className="py-1">
          {Object.entries(byProperty).map(([prop, items]) => (
            <div key={prop}>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-[#867970] uppercase tracking-wider">
                {prop}
              </p>
              {items.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
                  <div className="flex items-start gap-2.5 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#272525] leading-snug truncate">{t.title}</p>
                      {t.assignee && (
                        <p className="text-[11px] text-[#867970] mt-0.5">{t.assignee}</p>
                      )}
                      {!t.assignee && (
                        <p className="text-[11px] text-[#B88E23] mt-0.5">Unassigned</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-0.5 ${STATUS_STYLE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </ColCard>
  )
}
