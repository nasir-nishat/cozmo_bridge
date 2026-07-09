import ColCard from './ColCard'
import type { BookingEntry, GroupEntry, PropertyTask, HealthData } from '@/lib/types'

interface TodoItem {
  priority: 'high' | 'mid' | 'low'
  text: string
}

function buildTodos(
  arriving: BookingEntry[],
  groups: GroupEntry[],
  tasks: PropertyTask[],
  health: HealthData | null,
): TodoItem[] {
  const items: TodoItem[] = []
  const groupByLead = Object.fromEntries(groups.map(g => [g.leadUid, g]))

  // Offline platforms
  if (health) {
    const platforms = health.platforms as Record<string, { enabled: boolean; connected: boolean }>
    const labels: Record<string, string> = { whatsapp: 'WhatsApp', line: 'LINE', kakao: 'KakaoTalk', wechat: 'WeChat' }
    for (const [key, p] of Object.entries(platforms)) {
      if (p.enabled && !p.connected) {
        items.push({ priority: 'high', text: `${labels[key] ?? key} is offline - check connection` })
      }
    }
  }

  // Arrivals without a group
  for (const b of arriving) {
    if (!groupByLead[b.leadUid]) {
      items.push({ priority: 'high', text: `No messenger group for ${b.guestName} arriving today` })
    }
  }

  // Unassigned open tasks
  const unassigned = tasks.filter(t => t.status !== 'done' && !t.assignee)
  if (unassigned.length > 0) {
    items.push({ priority: 'mid', text: `${unassigned.length} open task${unassigned.length !== 1 ? 's' : ''} with no assignee` })
  }

  // Doing tasks
  const doing = tasks.filter(t => t.status === 'doing')
  if (doing.length > 0) {
    items.push({ priority: 'low', text: `${doing.length} task${doing.length !== 1 ? 's' : ''} in progress` })
  }

  if (items.length === 0) {
    items.push({ priority: 'low', text: 'All systems good - nothing urgent' })
  }

  return items
}

const DOT: Record<string, string> = {
  high: 'bg-[#DC2626]',
  mid:  'bg-[#D97706]',
  low:  'bg-[#16A34A]',
}

interface Props {
  arriving: BookingEntry[]
  groups: GroupEntry[]
  tasks: PropertyTask[]
  health: HealthData | null
}

export default function CozmoTodo({ arriving, groups, tasks, health }: Props) {
  const todos = buildTodos(arriving, groups, tasks, health)
  const urgent = todos.filter(t => t.priority === 'high').length

  return (
    <ColCard label="COZMO Todo" count={urgent > 0 ? urgent : undefined}>
      <div className="py-2">
        {todos.map((item, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${DOT[item.priority]}`} />
            <p className="text-[13px] text-[#272525] leading-snug">{item.text}</p>
          </div>
        ))}
      </div>
    </ColCard>
  )
}
