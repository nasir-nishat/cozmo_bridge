'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn, fmt } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { ScanBanner } from './ScanBanner'
import type { KakaoGroup, ScanResult } from '@/lib/types'

export function GroupCard({
  group,
  scanResult,
  onScan,
  scanning,
}: {
  group: KakaoGroup
  scanResult?: ScanResult
  onScan: (groupKey: string) => void
  scanning: boolean
}) {
  const [open, setOpen] = useState(false)
  const b = group.booking

  const title = group.chatName || (b ? b.property : group.groupKey.replace('kakao:', ''))
  const unsettled = group.sheetExpenses.filter(e => !e.settled)
  const hasBufferWarning = group.bufferedExpCount > 0 && group.bufferedExpCount > unsettled.length

  useEffect(() => { if (scanResult) setOpen(true) }, [scanResult])

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-secondary/50 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate">{title}</span>
            <StatusBadge status={b?.status} />
            {hasBufferWarning && (
              <Badge variant="warning">⚠ {group.bufferedExpCount} in buffer</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {b?.guestName && <span>{b.guestName}</span>}
            {b && <span>{b.checkIn} → {b.checkOut}</span>}
            <span>{group.bufferedMsgCount} buffered</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unsettled.length > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold tabular-nums">
              ₩{fmt(group.total)}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={scanning}
            onClick={e => { e.stopPropagation(); onScan(group.groupKey) }}
          >
            {scanning ? '…' : 'Scan'}
          </Button>
          <ChevronDown
            className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-border px-4 pb-4">
          {scanResult && <ScanBanner result={scanResult} />}

          {group.sheetExpenses.length > 0 ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                Expenses — {unsettled.length} unsettled / {group.sheetExpenses.length} total
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.sheetExpenses.map(e => (
                    <TableRow key={e.id} className={e.settled ? 'opacity-40' : ''}>
                      <TableCell className={cn('text-foreground', e.settled && 'line-through')}>
                        {e.item}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{e.cardName || e.card}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-foreground">
                        ₩{fmt(e.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.loggedBy}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString('ko-KR', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="mt-3 rounded-lg bg-secondary border border-border px-4 py-3 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal (unsettled)</span>
                  <span className="text-base font-bold text-foreground tabular-nums">₩{fmt(group.total)}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">+10% VAT — Bank / WISE</span>
                  <span className="text-sm font-medium text-foreground tabular-nums">₩{fmt(group.totalVat10)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">+14.5% VAT — Card</span>
                  <span className="text-sm font-medium text-foreground tabular-nums">₩{fmt(group.totalVat145)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground py-6">
              No expenses logged for this group yet.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
