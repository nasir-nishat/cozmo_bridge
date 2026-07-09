import { Loader2 } from 'lucide-react'
import ColCard from './ColCard'

export interface ExpenseSummaryGroup {
  groupId: string
  groupName: string
  platform: string
  total: number
  count: number
}

const PLATFORM_LABEL: Record<string, string> = { whatsapp: 'WA', line: 'LINE', kakao: 'KT', wechat: 'WC' }
const PLATFORM_COLOR: Record<string, string> = {
  whatsapp: 'bg-[#DCFCE7] text-[#166534]',
  line:     'bg-[#DBEAFE] text-[#1E40AF]',
  kakao:    'bg-[#FEF9C3] text-[#854D0E]',
  wechat:   'bg-[#D1FAE5] text-[#065F46]',
}

function krw(n: number) { return `₩${n.toLocaleString('en-US')}` }

function groupLabel(g: ExpenseSummaryGroup) {
  if (g.groupName) return g.groupName
  return g.groupId.slice(-8)
}

interface Props {
  summary: ExpenseSummaryGroup[]
  loading: boolean
}

export default function ExpensesCol({ summary, loading }: Props) {
  const totalKrw = summary.reduce((s, g) => s + g.total, 0)

  return (
    <ColCard
      label="Expenses"
      action={
        totalKrw > 0
          ? <span className="text-[11px] font-semibold text-[#272525]">{krw(totalKrw)}</span>
          : undefined
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-4 h-4 text-[#867970] animate-spin" />
        </div>
      ) : summary.length === 0 ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">No pending expenses</p>
      ) : (
        <div>
          {summary.map((g, i) => (
            <div key={g.groupId}>
              {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#272525] truncate">{groupLabel(g)}</p>
                  <p className="text-[11px] text-[#867970] mt-0.5">{g.count} item{g.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-semibold text-[#272525]">{krw(g.total)}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PLATFORM_COLOR[g.platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]'}`}>
                    {PLATFORM_LABEL[g.platform] ?? g.platform}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColCard>
  )
}
